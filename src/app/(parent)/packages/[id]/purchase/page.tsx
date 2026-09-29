import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { CalendarClock, Clock, Ticket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PurchasePanel } from '@/components/parent/package-purchase-panel';
import { packagePriceBreakdown } from '@/lib/packages';

export const dynamic = 'force-dynamic';

export default async function PackagePurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paymentId?: string; cancelled?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id } = await params;
  const sp = await searchParams;

  const pkgSnap = await db.collection(COLLECTIONS.PACKAGES).doc(id).get();
  if (!pkgSnap.exists) notFound();
  const pkg = { id: pkgSnap.id, ...pkgSnap.data() } as any;
  if (pkg.isActive !== true) notFound();

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(String(pkg.courseId)).get();
  const course = courseSnap.exists ? (courseSnap.data() as any) : null;

  const studentsSnap = await db.collection(COLLECTIONS.STUDENTS)
    .where('parentId', '==', session.uid)
    .limit(20)
    .get();
  const students = studentsSnap.docs.map((doc: any) => ({ id: doc.id, name: String(doc.data()?.name || '') }));

  // แพ็กเกจที่ซื้อแล้ว (pending หรือ active) ของผู้ปกครองคนนี้ — แสดงล่าสุดก่อน
  const ownedSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES)
    .where('parentId', '==', session.uid)
    .where('packageId', '==', id)
    .limit(10)
    .get();
  const owned = ownedSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  const breakdown = packagePriceBreakdown(Number(pkg.priceTotal) || 0, Number(pkg.sessionsTotal) || 1);

  return (
    <DashboardLayout
      title="ซื้อแพ็กเกจ"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* รายละเอียดแพ็กเกจ */}
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
              <Ticket className="h-4 w-4" />
            </span>
            {pkg.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{pkg.courseTitle || course?.title}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">จำนวนเรียน</p>
              <p className="text-lg font-extrabold text-slate-900">{pkg.sessionsTotal} ครั้ง</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">ราคารวม</p>
              <p className="text-lg font-extrabold text-pink-700">{formatCurrency(Number(pkg.priceTotal) || 0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">ราคาเฉลี่ย/ครั้ง</p>
              <p className="text-lg font-extrabold text-slate-900">
                {formatCurrency(Number(pkg.sessionsTotal) > 0 ? Math.round((Number(pkg.priceTotal) || 0) / Number(pkg.sessionsTotal)) : 0)}
              </p>
            </div>
          </div>

          {(Number(pkg.discountPercent) > 0 || (Number(course?.pricePerSession) || 0) > 0) && (
            <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {Number(pkg.discountPercent) > 0 && (
                <p className="font-bold">ส่วนลดแพ็กเกจ {pkg.discountPercent}% เมื่อเทียบกับราคาเดี่ยว {formatCurrency(Number(course?.pricePerSession) || 0)}/ครั้ง</p>
              )}
              {breakdown.list > 0 && Number(pkg.discountPercent) <= 0 && (
                <p className="font-bold">ราคาปกติรวม {formatCurrency(breakdown.list)}</p>
              )}
            </div>
          )}

          {course?.durationMinutes ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" /> ครั้งละ {course.durationMinutes} นาที
              <CalendarClock className="ml-3 h-3.5 w-3.5" /> จองล่วงหน้าได้ถึง 60 วัน
            </p>
          ) : null}

          {/* รายการซื้อที่มีอยู่ */}
          {owned.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">แพ็กเกจนี้ที่คุณซื้อไว้</h3>
              <div className="mt-2 space-y-2">
                {owned.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                    <span className="text-slate-600">นักเรียน: {o.studentName || '-'}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">เหลือ {Math.max(0, Number(o.sessionsRemaining) || 0)}/{o.sessionsTotal}</span>
                      {o.status === 'active' ? <Badge variant="success">พร้อมใช้</Badge>
                        : o.status === 'pending' ? <Badge variant="warning">รอชำระเงิน</Badge>
                        : <Badge variant="outline">ใช้ครบแล้ว</Badge>}
                      <a href={`/packages/${o.id}`} className="font-bold text-pink-600 hover:underline">จัดการ →</a>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ฟอร์มซื้อ */}
        <PurchasePanel
          packageId={pkg.id}
          packageTitle={pkg.title}
          courseTitle={pkg.courseTitle || course?.title || ''}
          priceTotal={Number(pkg.priceTotal) || 0}
          sessionsTotal={Number(pkg.sessionsTotal) || 0}
          students={students}
          paymentId={sp.paymentId || ''}
          cancelled={sp.cancelled === '1'}
        />
      </div>
    </DashboardLayout>
  );
}
