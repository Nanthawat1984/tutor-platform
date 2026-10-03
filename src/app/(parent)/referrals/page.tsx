import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Gift, Sparkles, Users, Wallet } from 'lucide-react';
import { DashboardLayout, EmptyState, SectionCard, StatCard } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/guards';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getReferralSummary, REFERRAL_REWARD_AMOUNT } from '@/lib/referrals';
import ReferralShareCard from '@/components/parent/referral-share-card';
import ReferralClaimForm from '@/components/parent/referral-claim-form';

// /referrals — ชวนเพื่อน: โค้ดของฉัน + สถิติคนที่ใช้โค้ด + ใช้โค้ดของเพื่อน
// ข้อมูลมาจาก getReferralSummary (server/Admin SDK) เพราะ firestore.rules
// ปิดการอ่าน referrals จาก client ทั้งหมด
export default async function ReferralsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const { session } = await requireRole(['parent']);

  const summary = await getReferralSummary(db, session.uid);

  const STATS = [
    {
      label: 'คนที่ใช้โค้ดของคุณ',
      value: summary.total,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'ได้รับรางวัลแล้ว',
      value: summary.rewarded,
      icon: <Sparkles className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'รอการยืนยัน',
      value: summary.pending,
      icon: <Gift className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
    },
    {
      label: 'มูลค่ารางวัลรวม',
      value: formatCurrency(summary.earnedAmount),
      icon: <Wallet className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
  ];

  return (
    <DashboardLayout
      title="ชวนเพื่อน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">
        ส่งโค้ดให้เพื่อนสมัคร — เพื่อนได้ส่วนลด คุณได้รางวัล {formatCurrency(REFERRAL_REWARD_AMOUNT)} เมื่อเขาชำระเงินสำเร็จครั้งแรก
      </p>

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

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <SectionCard title="โค้ดของคุณ">
          <ReferralShareCard code={summary.code} rewardAmount={REFERRAL_REWARD_AMOUNT} />
        </SectionCard>

        <SectionCard title="มีโค้ดจากเพื่อน?">
          <ReferralClaimForm />
        </SectionCard>
      </div>

      <div className="mt-5">
        <SectionCard title="คนที่ใช้โค้ดของคุณ">
          {summary.entries.length === 0 ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" />}
              title="ยังไม่มีใครใช้โค้ดของคุณ"
              description="ส่งโค้ดให้เพื่อนหรือผู้ปกครองที่กำลังมองหาครูพิเศษ แล้วรางวัลจะทยอยเข้ามาเมื่อเขาชำระเงินสำเร็จ"
            />
          ) : (
            <div className="space-y-2">
              {summary.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-pink-100/60 bg-pink-50/40 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{entry.email}</p>
                    <p className="text-xs text-slate-400">
                      {entry.createdAt
                        ? `ใช้โค้ดเมื่อ ${formatDate(new Date(entry.createdAt), 'd MMM yyyy')}`
                        : 'ใช้โค้ด'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{formatCurrency(entry.rewardAmount)}</span>
                    {entry.status === 'rewarded' ? (
                      <Badge variant="success" size="sm">ได้รางวัลแล้ว</Badge>
                    ) : (
                      <Badge variant="warning" size="sm">รอชำระเงิน</Badge>
                    )}
                  </div>
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