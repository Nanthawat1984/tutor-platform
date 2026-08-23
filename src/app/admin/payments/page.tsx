import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FieldValue } from 'firebase-admin/firestore';
import { Eye, FileCheck2, FileWarning, XCircle } from 'lucide-react';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardLayout, EmptyState, StatCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { PaymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/auth/guards';
import { markPaymentFailed, markPaymentPaid } from '@/lib/payments/process';

interface AdminPaymentsProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsProps) {
  const { session, db } = await requireAdmin();
  const params = await searchParams;
  const statusFilter = params.status === 'all' ? '' : (params.status || 'awaiting_review');

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('method', '==', 'bank_transfer')
    .limit(200)
    .get();
  const payments = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((payment: any) => !statusFilter || payment.status === statusFilter)
    .sort((a: any, b: any) => {
      const aTime = a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bTime = b.submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

  const pendingCount = paymentsSnap.docs.filter((doc: any) => doc.data()?.status === 'awaiting_review').length;
  const paidCount = paymentsSnap.docs.filter((doc: any) => doc.data()?.status === 'paid').length;
  const rejectedCount = paymentsSnap.docs.filter((doc: any) => doc.data()?.status === 'failed').length;

  async function reviewPaymentAction(formData: FormData) {
    'use server';
    const { db: dbRef, session: adminSession } = await requireAdmin();
    const paymentId = String(formData.get('payment_id') || '').trim();
    const decision = String(formData.get('decision') || '').trim();
    const reviewNote = String(formData.get('review_note') || '').trim();
    if (!paymentId || !['approve', 'reject'].includes(decision)) return;

    const paymentRef = dbRef.collection(COLLECTIONS.PAYMENTS).doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) return;
    const payment = paymentSnap.data() as any;
    if (payment.method !== 'bank_transfer' || payment.status !== 'awaiting_review') return;

    if (decision === 'reject') {
      if (!reviewNote) return;
      await markPaymentFailed(dbRef, paymentId, 'bank_transfer_rejected');
      await paymentRef.update({
        reviewedBy: adminSession.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const result = await markPaymentPaid(dbRef, paymentId, {
        transactionId: `bank_transfer_${paymentId}`,
        providerRef: payment.slipPath || null,
      });
      if (!result.ok) return;
      await paymentRef.update({
        reviewedBy: adminSession.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: reviewNote || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    redirect('/admin/payments');
  }

  return (
    <DashboardLayout title="ตรวจสอบการชำระเงิน" navItems={ADMIN_NAV_ITEMS} role="admin" userName={session.displayName || 'Admin'}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">ตรวจสอบการโอนเงินและสลิปก่อนยืนยันการจอง</p>
          <p className="mt-1 text-xs text-amber-700">ห้ามกดอนุมัติจนกว่าจะตรวจยอดเข้าบัญชีจริงแล้ว</p>
        </div>
        <Link href="/admin/dashboard" className="text-sm font-semibold text-pink-600 hover:underline">← กลับแดชบอร์ด</Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="รอตรวจสอบ" value={pendingCount} icon={<FileWarning className="h-6 w-6" />} iconGradient="from-amber-500 to-orange-500" />
        <StatCard label="อนุมัติแล้ว" value={paidCount} icon={<FileCheck2 className="h-6 w-6" />} iconGradient="from-emerald-500 to-teal-600" />
        <StatCard label="ปฏิเสธ" value={rejectedCount} icon={<XCircle className="h-6 w-6" />} iconGradient="from-rose-500 to-red-600" />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { value: 'awaiting_review', label: 'รอตรวจสอบ' },
          { value: 'all', label: 'ทั้งหมด' },
          { value: 'paid', label: 'อนุมัติแล้ว' },
          { value: 'failed', label: 'ปฏิเสธ' },
        ].map((filter) => (
          <Link key={filter.value} href={`/admin/payments?status=${filter.value}`} className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusFilter === (filter.value === 'all' ? '' : filter.value) ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-700'}`}>
            {filter.label}
          </Link>
        ))}
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={<FileCheck2 className="h-7 w-7" />} title="ไม่มีรายการในสถานะนี้" description="รายการโอนพร้อมสลิปจะปรากฏที่นี่หลังผู้ปกครองส่งข้อมูล" />
      ) : (
        <div className="space-y-4">
          {payments.map((payment: any) => (
            <div key={payment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PaymentStatusBadge status={payment.status} />
                    <span className="font-bold text-slate-900">{formatCurrency(payment.amount)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{payment.courseTitle || 'คอร์สเรียน'} • {payment.studentName || 'นักเรียน'}</p>
                  <p className="mt-1 text-xs text-slate-500">รหัสรายการ: {payment.id} • ส่งเมื่อ {payment.submittedAt ? formatDate(payment.submittedAt.toDate?.() || payment.submittedAt, 'd MMM yyyy HH:mm') : '-'}</p>
                </div>
                {payment.slipPath && (
                  <a href={`/api/admin/payments/${payment.id}/slip`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-pink-700 underline">
                    <Eye className="h-4 w-4" /> ดูสลิป
                  </a>
                )}
              </div>

              {payment.status === 'awaiting_review' && (
                <form action={reviewPaymentAction} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <div>
                    <label htmlFor={`review-note-${payment.id}`} className="mb-1 block text-xs font-bold text-slate-600">หมายเหตุการตรวจสอบ</label>
                    <input id={`review-note-${payment.id}`} name="review_note" placeholder="เช่น ยอดเข้าบัญชีครบถ้วน" className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                  <input type="hidden" name="payment_id" value={payment.id} />
                  <button type="submit" name="decision" value="reject" className="min-h-[42px] rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">ปฏิเสธ</button>
                  <button type="submit" name="decision" value="approve" className="min-h-[42px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">อนุมัติการโอน</button>
                </form>
              )}
              {payment.reviewNote && <p className="mt-3 text-xs text-slate-500">หมายเหตุ: {payment.reviewNote}</p>}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
