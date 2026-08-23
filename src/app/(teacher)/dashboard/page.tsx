import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import {
  BookOpen,
  CalendarCheck,
  GraduationCap,
  MessageCircle,
  PenLine,
  Plus,
  Star,
  Users,
  Wallet,
  ClipboardCheck,
} from 'lucide-react';
import { DashboardLayout, StatCard, EmptyState, SectionCard } from '@/components/layout/dashboard';
import { BookingStatusBadge } from '@/components/ui/badge';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';

export default async function TeacherDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  // Role guard — /dashboard เป็นหน้าเฉพาะครู (กันผู้ปกครอง/แอดมินเห็นมุมมองครู)
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  const userRole = userDoc.exists ? (userDoc.data()?.role as string | undefined) : undefined;
  if (userRole === 'parent') redirect('/my-bookings');
  if (userRole === 'admin') redirect('/admin/dashboard');

  let upcomingBookings: any[] = [];
  let activeCourses = 0;
  let setupError = false;

  try {
    const [bookingsSnap, coursesSnap] = await Promise.all([
      db.collection(COLLECTIONS.BOOKINGS)
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'confirmed')
        .orderBy('bookingDate')
        .limit(5)
        .get(),
      db.collection(COLLECTIONS.COURSES)
        .where('teacherId', '==', teacherId)
        .where('isActive', '==', true)
        .get(),
    ]);

    upcomingBookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    activeCourses = coursesSnap.size;
  } catch (error) {
    if ((error as { code?: number }).code !== 5) throw error;
    setupError = true;
  }

  const STATS = [
    {
      label: 'นักเรียนทั้งหมด',
      value: 0,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
      trend: { value: 12, isPositive: true },
    },
    {
      label: 'คอร์สที่เปิดสอน',
      value: activeCourses,
      icon: <BookOpen className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
    {
      label: 'คะแนนเฉลี่ย',
      value: '—',
      icon: <Star className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
      subtext: 'ยังไม่มีรีวิว',
    },
    {
      label: 'รีวิวทั้งหมด',
      value: 0,
      icon: <MessageCircle className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="แดชบอร์ด"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      {/* ── Setup Error Banner ── */}
      {setupError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="mt-0.5 text-amber-500 text-lg">⚠</span>
          <div className="text-sm text-amber-900">
            <p className="font-bold">ยังไม่ได้เชื่อมต่อ Firestore</p>
            <p className="mt-0.5 text-amber-700">กรุณาเปิดใช้งาน Cloud Firestore database ใน Firebase project ก่อนใช้งาน</p>
          </div>
        </div>
      )}

      {/* ── Greeting ── */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">
            สวัสดีตอนเช้า คุณครู! 👋
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            นี่คือสรุปภาพรวมของคุณวันนี้
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/teachers/${teacherId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-pink-200 bg-white/70 px-3.5 py-2 text-xs font-bold text-pink-700 transition-colors hover:bg-pink-50"
          >
            <Star className="h-3.5 w-3.5" />
            ดูโปรไฟล์สาธารณะ
          </Link>
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-edu-gradient px-3.5 py-2 text-xs font-bold text-white shadow-button transition-all hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <PenLine className="h-3.5 w-3.5" />
            แก้ไขโปรไฟล์
          </Link>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat, i) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconGradient={stat.iconGradient}
            subtext={stat.subtext}
            trend={stat.trend}
          />
        ))}
      </div>

      {/* ── Bottom Grid ── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">

        {/* Sessions */}
        <SectionCard
          title="เซสชันวันนี้ / ถัดไป"
          action={
            <Link
              href="/schedule"
              className="text-xs font-bold text-pink-600 hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          }
        >
          {upcomingBookings.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="h-7 w-7" />}
              title="ยังไม่มีเซสชัน"
              description="เซสชันที่กำลังจะมาถึงจะแสดงที่นี่"
              action={{ label: 'ดูตารางสอน', href: '/schedule' }}
            />
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-pink-100/60 bg-pink-50/40 p-3.5 transition-colors hover:bg-pink-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-sm font-bold text-pink-700">
                      {b.studentName?.charAt(0) ?? 'น'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 text-sm">{b.studentName}</p>
                      <p className="truncate text-xs text-slate-500">{b.courseTitle} • {b.startTime}</p>
                      {b.studentLevel && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-700">
                          <GraduationCap className="h-3 w-3" />
                          {b.studentLevel}
                        </span>
                      )}
                    </div>
                  </div>
                  <BookingStatusBadge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Quick Actions */}
        <SectionCard title="ดำเนินการด่วน">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Plus, label: 'สร้างคอร์สใหม่', href: '/courses/new', gradient: 'from-pink-500 to-rose-600' },
              { icon: CalendarCheck, label: 'จัดการตาราง', href: '/schedule', gradient: 'from-indigo-500 to-blue-600' },
              { icon: ClipboardCheck, label: 'เช็คชื่อเรียน', href: '/attendance', gradient: 'from-emerald-500 to-teal-600' },
              { icon: Wallet, label: 'ดูรายได้', href: '/earnings', gradient: 'from-amber-500 to-orange-500' },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-pink-100/60 bg-white/60 p-4 text-center transition-all hover:bg-pink-50/60 hover:-translate-y-0.5 hover:shadow-card"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${action.gradient} shadow-sm`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 leading-tight">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        {/* Attendance Today */}
        <SectionCard
          title="เช็คชื่อวันนี้"
          action={
            <Link href="/attendance" className="text-xs font-bold text-pink-600 hover:underline">
              จัดการ →
            </Link>
          }
        >
          <EmptyState
            icon={<ClipboardCheck className="h-7 w-7" />}
            title="ยังไม่มีการเช็คชื่อ"
            description="การเช็คชื่อวันนี้จะแสดงที่นี่หลังเริ่มสอน"
          />
        </SectionCard>

        {/* Recent Reviews */}
        <SectionCard title="รีวิวล่าสุด">
          <EmptyState
            icon={<Star className="h-7 w-7" />}
            title="ยังไม่มีรีวิว"
            description="รีวิวจากผู้ปกครองจะแสดงที่นี่หลังเรียนจบ"
          />
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
