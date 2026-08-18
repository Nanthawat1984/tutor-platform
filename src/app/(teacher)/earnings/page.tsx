import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { Wallet, Receipt, PiggyBank } from 'lucide-react';
import { DashboardLayout, StatCard, SectionCard } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';

export default async function EarningsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('status', '==', 'paid')
    .get();

  const payments = paymentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const totalEarnings = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const thisMonthEarnings = payments
    .filter((p: any) => p.paidAt && new Date(p.paidAt.toDate?.() || p.paidAt) >= new Date(firstOfMonth))
    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const STATS = [
    {
      label: 'รายได้รวม',
      value: formatCurrency(totalEarnings),
      icon: <Wallet className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'รายได้เดือนนี้',
      value: formatCurrency(thisMonthEarnings),
      icon: <Receipt className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
    {
      label: 'รายได้สุทธิ (หลังค่าบริการ 20%)',
      value: formatCurrency(totalEarnings * 0.8),
      icon: <PiggyBank className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="รายได้"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">สรุปรายได้ของคุณ</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        <SectionCard title="การจ่ายเงิน">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              ค่าบริการแพลตฟอร์มคิด 20% ของรายได้ต่อเซสชัน รายได้สุทธิจะถูกโอนเข้าบัญชีของคุณ
            </p>
            <span className="pill-badge-info shrink-0">โอนทุกวันที่ 1 ของเดือน</span>
          </div>
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
