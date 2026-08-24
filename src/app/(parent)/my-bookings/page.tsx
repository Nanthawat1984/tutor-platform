import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { BarChart3, CalendarCheck, CalendarDays, ClipboardList, GraduationCap, PenLine, Search, Star } from 'lucide-react';
import { DashboardLayout, StatCard, EmptyState, SectionCard } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { BookingStatusBadge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/guards';

export default async function ParentDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const { session } = await requireRole(['parent']);
  const parentId = session.uid;

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('parentId', '==', parentId)
    .limit(10)
    .get();

  const bookings = bookingsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => String(b.bookingDate || '').localeCompare(String(a.bookingDate || '')))
    .slice(0, 10);

  const upcomingCount = bookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending').length;
  const completedCount = bookings.filter((b: any) => b.status === 'completed').length;

  const STATS = [
    {
      label: 'การจองที่กำลังจะมาถึง',
      value: upcomingCount,
      icon: <CalendarCheck className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'การจองทั้งหมด',
      value: bookings.length,
      icon: <ClipboardList className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
    {
      label: 'เซสชันที่เสร็จสิ้น',
      value: completedCount,
      icon: <BarChart3 className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'ครูที่กำลังเรียน',
      value: new Set(bookings.map((b: any) => b.teacherName)).size,
      icon: <Star className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
    },
  ];

  return (
    <DashboardLayout
      title="แดชบอร์ด"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      {/* ── Greeting ── */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">
            สวัสดี คุณพ่อคุณแม่! 👋
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            จัดการการเรียนเสริมของลูกคุณได้ที่นี่
          </p>
        </div>
        <Link
          href="/my-profile"
          className="inline-flex items-center gap-1.5 rounded-xl bg-edu-gradient px-3.5 py-2 text-xs font-bold text-white shadow-button transition-all hover:-translate-y-0.5 hover:shadow-elevated"
        >
          <PenLine className="h-3.5 w-3.5" />
          แก้ไขโปรไฟล์
        </Link>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconGradient={stat.iconGradient}
          />
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <SectionCard title="ดำเนินการด่วน">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Search, label: 'ค้นหาครู', href: '/explore', gradient: 'from-pink-500 to-rose-600' },
              { icon: CalendarDays, label: 'การจอง', href: '/bookings', gradient: 'from-indigo-500 to-blue-600' },
              { icon: BarChart3, label: 'ผลการเรียน', href: '/progress', gradient: 'from-emerald-500 to-teal-600' },
              { icon: GraduationCap, label: 'นักเรียนของฉัน', href: '/my-students', gradient: 'from-amber-500 to-orange-500' },
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

        {/* Recent Bookings */}
        <SectionCard
          title="การจองล่าสุด"
          action={
            <Link href="/bookings" className="text-xs font-bold text-pink-600 hover:underline">
              ดูทั้งหมด →
            </Link>
          }
        >
          {bookings.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-7 w-7" />}
              title="ยังไม่มีการจอง"
              description="ค้นหาครูพิเศษให้ลูกของคุณได้เลย"
              action={{ label: 'เริ่มค้นหาครู', href: '/explore' }}
            />
          ) : (
            <div className="space-y-3">
              {bookings.map((b: any) => (
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
                      <p className="truncate text-xs text-slate-500">{b.courseTitle} • ครู{b.teacherName}</p>
                    </div>
                  </div>
                  <BookingStatusBadge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
