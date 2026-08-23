import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { Users, Clock, BookOpen, Star } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DashboardLayout, StatCard, SectionCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { VerificationBadge } from '@/components/ui/badge';

export default async function AdminDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const [teachersSnap, bookingsSnap, paymentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('role', '==', 'teacher').get(),
    db.collection(COLLECTIONS.BOOKINGS).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').get(),
  ]);
  const teachers = teachersSnap.docs.map((doc: any) => ({ uid: doc.id, ...doc.data() }));
  const pendingTeachers = teachers.filter((t: any) => !t.isVerified);
  const totalRevenue = paymentsSnap.docs.reduce((sum: number, d: any) => sum + ((d.data() as any).amount || 0), 0);

  const STATS = [
    {
      label: 'ครูทั้งหมด',
      value: teachers.length,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'รออนุมัติ',
      value: pendingTeachers.length,
      icon: <Clock className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
    },
    {
      label: 'การจองทั้งหมด',
      value: bookingsSnap.size,
      icon: <BookOpen className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'รายได้รวม',
      value: formatCurrency(totalRevenue),
      icon: <Star className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
  ];

  return (
    <DashboardLayout
      title="Admin Dashboard"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <p className="mb-6 text-sm text-slate-500">ภาพรวมระบบ</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: '/admin/teachers', label: 'จัดการครู', gradient: 'from-pink-500 to-rose-600' },
          { href: '/admin/payments', label: 'ตรวจสอบโอนเงิน', gradient: 'from-sky-500 to-cyan-600' },
          { href: '/admin/payouts', label: 'อนุมัติเบิกเงินครู', gradient: 'from-emerald-500 to-teal-600' },
          { href: '/admin/tax-report', label: 'ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.53)', gradient: 'from-amber-500 to-orange-600' },
          { href: '/admin/parents', label: 'ผู้ปกครอง', gradient: 'from-indigo-500 to-blue-600' },
          { href: '/admin/students', label: 'นักเรียน', gradient: 'from-sky-500 to-cyan-600' },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br ${action.gradient} px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card`}
          >
            {action.label}
          </Link>
        ))}
      </div>

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

      <div className="mt-6">
        <SectionCard
          title="ครูที่รอการอนุมัติ"
          action={
            <Link href="/admin/teachers" className="text-xs font-bold text-pink-600 hover:underline">
              ดูทั้งหมด →
            </Link>
          }
        >
          {pendingTeachers.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มีครูที่รอการอนุมัติ</p>
          ) : (
            <div className="space-y-2">
              {pendingTeachers.slice(0, 5).map((t: any) => (
                <div key={t.uid} className="responsive-card-row rounded-xl border border-pink-100/60 bg-pink-50/40 p-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{t.displayName}</p>
                    <p className="text-sm text-gray-500">{t.email}</p>
                  </div>
                  <VerificationBadge level={t.verificationLevel} />
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
