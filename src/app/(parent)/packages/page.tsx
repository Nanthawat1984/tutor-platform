import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus, PackageOpen, Ticket, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardLayout, EmptyState, StatCard } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function PackagesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;

  const purchasesSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES)
    .where('parentId', '==', parentId)
    .limit(50)
    .get();

  const purchases = purchasesSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

  const activePurchases = purchases.filter((p: any) => p.status === 'active');
  const remainingCredits = purchases.reduce((sum: number, p: any) => {
    return sum + (p.status === 'active' ? Math.max(0, Number(p.sessionsRemaining) || 0) : 0);
  }, 0);
  const lowCreditCount = purchases.filter((p: any) => {
    if (p.status !== 'active') return false;
    const remaining = Number(p.sessionsRemaining) || 0;
    return remaining > 0 && remaining <= 2;
  }).length;

  function purchaseStatusBadge(status: string) {
    if (status === 'active') return <Badge variant="success">พร้อมใช้</Badge>;
    if (status === 'depleted') return <Badge variant="outline">ใช้ครบแล้ว</Badge>;
    if (status === 'pending') return <Badge variant="warning">รอชำระเงิน</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  }

  return (
    <DashboardLayout
      title="แพ็กเกจของฉัน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">
        เครดิตแพ็กเกจที่ซื้อไว้ — กด "จองด้วยเครดิต" เพื่อเลือกเวลาเรียนได้ทันที โดยไม่ต้องชำระเงินซ้ำ
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="เครดิตคงเหลือรวม"
          value={remainingCredits}
          icon={<Ticket className="h-6 w-6" />}
          iconGradient="from-pink-500 to-rose-600"
        />
        <StatCard
          label="แพ็กเกจที่ใช้งานได้"
          value={activePurchases.length}
          icon={<PackageOpen className="h-6 w-6" />}
          iconGradient="from-indigo-500 to-blue-600"
        />
        <StatCard
          label="ใกล้หมด (≤ 2 ครั้ง)"
          value={lowCreditCount}
          icon={<Users className="h-6 w-6" />}
          iconGradient="from-amber-500 to-orange-500"
        />
      </div>

      {purchases.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-7 w-7" />}
          title="ยังไม่มีแพ็กเกจ"
          description="แพ็กเกจช่วยประหยัดค่าเรียน เมื่อซื้อแล้วจะจองเรียนด้วยเครดิตได้เลย"
          action={{ label: 'ค้นหาครู', href: '/explore' }}
        />
      ) : (
        <div className="space-y-4">
          {purchases.map((p: any) => {
            const total = Number(p.sessionsTotal) || 0;
            const remaining = Math.max(0, Number(p.sessionsRemaining) || 0);
            const used = Number(p.sessionsUsed) || 0;
            const percent = total > 0 ? Math.round((used / total) * 100) : 0;
            const canBook = p.status === 'active' && remaining > 0;
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{p.packageTitle || 'แพ็กเกจเรียน'}</span>
                      {purchaseStatusBadge(String(p.status || ''))}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {p.courseTitle} • นักเรียน: {p.studentName || '-'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      ซื้อเมื่อ {p.createdAt ? new Date(p.createdAt.toDate?.() ?? p.createdAt).toLocaleDateString('th-TH') : '-'} • {formatCurrency(Number(p.amount) || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-pink-700">{remaining}<span className="text-sm font-bold text-slate-400">/{total}</span></p>
                    <p className="text-[11px] text-slate-400">ครั้งคงเหลือ</p>
                  </div>
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${percent >= 100 ? 'bg-slate-300' : percent >= 80 ? 'bg-amber-400' : 'bg-edu-gradient'}`}
                    style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">ใช้ไป {used} จาก {total} ครั้ง</p>

                <div className="mt-4">
                  {canBook ? (
                    <Link href={`/packages/${p.id}/book`} className="inline-flex">
                      <Button>
                        <CalendarPlus className="mr-1.5 h-4 w-4" />
                        จองด้วยเครดิต
                      </Button>
                    </Link>
                  ) : p.status === 'pending' ? (
                    <Link href={`/packages/${p.id}`} className="inline-flex">
                      <Button variant="outline">ชำระเงิน</Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">แพ็กเกจนี้ใช้ครบแล้ว</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
