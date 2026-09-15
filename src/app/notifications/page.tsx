import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS, PARENT_NAV_ITEMS, TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import { getRoleHomePath } from '@/lib/auth/role-routes';

// Single /notifications route for every role — route groups ((parent)/(teacher))
// share the same URL space, so two group pages at /notifications collide at
// build time. This page branches nav + accent by the Firestore role instead.
export default async function NotificationsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const role = (userSnap.exists ? (userSnap.data()?.role as string) : null) || 'parent';
  if (!['parent', 'teacher', 'admin'].includes(role)) redirect(getRoleHomePath(role as any));

  const navItems = role === 'teacher' ? TEACHER_NAV_ITEMS : role === 'admin' ? ADMIN_NAV_ITEMS : PARENT_NAV_ITEMS;
  const layoutRole = (role === 'teacher' ? 'teacher' : role === 'admin' ? 'admin' : 'parent') as 'teacher' | 'parent' | 'admin';
  const homeHref = role === 'teacher' ? '/dashboard' : role === 'admin' ? '/admin/dashboard' : '/my-bookings';
  const unreadCls = role === 'teacher'
    ? 'border-violet-200 bg-violet-50/60'
    : role === 'admin'
      ? 'border-amber-200 bg-amber-50/60'
      : 'border-pink-200 bg-pink-50/60';

  const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
    .where('userId', '==', session.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  const hasUnread = items.some((n: any) => !n.isRead);

  async function markAllReadAction() {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = await requireSessionUser();
    const unread = await dbRef.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', current.uid)
      .where('isRead', '==', false)
      .limit(200)
      .get();
    const batch = dbRef.batch();
    unread.docs.forEach((d: any) => batch.update(d.ref, { isRead: true }));
    await batch.commit();
    redirect('/notifications');
  }

  return (
    <DashboardLayout
      title="การแจ้งเตือน"
      navItems={navItems}
      role={layoutRole}
      userName={session.displayName || 'ผู้ใช้'}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {role === 'teacher'
            ? 'การจองใหม่ รีวิว และการโอนเงินจะแจ้งเตือนที่นี่'
            : role === 'admin'
              ? 'สรุปรอบโอนและงานที่ต้องตรวจจะแจ้งเตือนที่นี่'
              : 'ข่าวการจอง ชำระเงิน เช็คชื่อ และรายงานผลของลูก'}
        </p>
        {hasUnread && (
          <form action={markAllReadAction}>
            <button type="submit" className="text-xs font-bold text-pink-600 hover:underline">
              อ่านทั้งหมด
            </button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-7 w-7" />}
          title="ยังไม่มีการแจ้งเตือน"
          description="ข่าวสำคัญเกี่ยวกับการเรียนจะแสดงที่นี่"
          action={{ label: 'กลับหน้าหลัก', href: homeHref }}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n: any) => (
            <li key={n.id} className={`rounded-2xl border p-4 ${n.isRead ? 'border-slate-200 bg-white' : unreadCls}`}>
              <p className="text-sm font-bold text-slate-900">{n.title}</p>
              <p className="mt-1 text-sm text-slate-600">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-400">
        <Link href={homeHref} className="font-semibold text-pink-600 hover:underline">← กลับหน้าหลัก</Link>
      </p>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
