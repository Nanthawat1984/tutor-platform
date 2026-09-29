import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { requireRole } from '@/lib/auth/guards';
import { PARENT_NAV_ITEMS, TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { DashboardLayout } from '@/components/layout/dashboard';
import ConversationList from '@/components/chat/conversation-list';
import { CONVERSATIONS_COLLECTION } from '@/types/chat';
import { toSummary } from '@/lib/chat/conversations';

// ห้องสนทนาทั้งหมด — หน้าเดียวใช้ได้ทั้งครูและผู้ปกครอง
// (ต้องอยู่ที่ src/app/messages ไม่ใช่ใน route group เพราะสองฝั่งใช้ URL เดียวกัน)
export default async function MessagesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const { session, role } = await requireRole(['teacher', 'parent']);

  let items: ReturnType<typeof toSummary>[] = [];
  try {
    const snap = await db.collection(CONVERSATIONS_COLLECTION)
      .where('participantIds', 'array-contains', session.uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(50)
      .get();
    items = snap.docs.map((d: any) => toSummary({ id: d.id, ...d.data() } as any, session.uid));
  } catch {
    // composite index ยังไม่พร้อม — ฝั่ง client จะเติมข้อมูลให้เองเมื่อสตรีมพร้อม
    items = [];
  }

  return (
    <DashboardLayout
      title="ข้อความ"
      navItems={role === 'teacher' ? TEACHER_NAV_ITEMS : PARENT_NAV_ITEMS}
      role={role}
      userName={session.displayName || (role === 'teacher' ? 'คุณครู' : 'ผู้ปกครอง')}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">สนทนากับ{role === 'teacher' ? 'ผู้ปกครอง' : 'ครู'}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {role === 'teacher'
              ? 'คุยกับผู้ปกครองได้ตลอดเวลา ไม่ต้องรอให้มีการจอง'
              : 'สอบถามครูได้ตลอดเวลา — ก่อนจอง ระหว่างเรียน หรือหลังเรียนจบ'}
          </p>
        </div>

        <ConversationList initial={items} viewerUid={session.uid} />
      </div>
    </DashboardLayout>
  );
}

export const metadata = {
  title: 'ข้อความ',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
