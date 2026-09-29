import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PackagePaymentPanel } from '@/components/parent/package-payment-panel';

export const dynamic = 'force-dynamic';

export default async function PackagePurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id } = await params;

  const purchaseSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(id).get();
  if (!purchaseSnap.exists) notFound();
  const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as any;
  // อนุญาตเฉพาะเจ้าของ (ผู้ปกครองที่ซื้อ)
  if (purchase.parentId !== session.uid) notFound();

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(String(purchase.courseId)).get();
  const course = courseSnap.exists ? courseSnap.data() as any : null;

  return (
    <DashboardLayout
      title="แพ็กเกจของฉัน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
                <Ticket className="h-4 w-4" />
              </span>
              {purchase.packageTitle || 'แพ็กเกจเรียน'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {purchase.courseTitle} • นักเรียน: {purchase.studentName || '-'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-pink-700">{formatCurrency(Number(purchase.amount) || 0)}</p>
            <p className="text-[11px] text-slate-400">{purchase.sessionsTotal} ครั้ง</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-500">คงเหลือ</p>
            <p className="text-xl font-extrabold text-slate-900">{Number(purchase.sessionsRemaining) || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-500">ใช้ไป</p>
            <p className="text-xl font-extrabold text-slate-900">{Number(purchase.sessionsUsed) || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-500">สถานะ</p>
            <p className="mt-1">
              {purchase.status === 'active' ? <Badge variant="success">พร้อมใช้</Badge>
                : purchase.status === 'pending' ? <Badge variant="warning">รอชำระเงิน</Badge>
                : <Badge variant="outline">{String(purchase.status || '-')}</Badge>}
            </p>
          </div>
        </div>

        <PackagePaymentPanel
          purchaseId={purchase.id}
          purchaseStatus={String(purchase.status || '')}
          courseId={String(purchase.courseId || '')}
          courseDurationMinutes={Number(course?.durationMinutes) || 0}
          sessionsRemaining={Number(purchase.sessionsRemaining) || 0}
        />
      </Card>
    </DashboardLayout>
  );
}
