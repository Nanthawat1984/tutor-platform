import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PAYMENT_METHODS } from '@/lib/payments/config';
import PaymentReceipt from '@/components/parent/payment-receipt';

export default async function PaymentSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paymentId?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id: bookingId } = await params;
  const { paymentId } = await searchParams;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) redirect('/bookings');
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.parentId !== session.uid) redirect('/bookings');

  let payment: any = null;
  if (paymentId) {
    const paymentSnap = await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();
    if (paymentSnap.exists) payment = { id: paymentSnap.id, ...paymentSnap.data() };
  }

  const methodLabel = PAYMENT_METHODS.find((m) => m.id === payment?.method)?.label
    || (payment?.method === 'promptpay' ? 'พร้อมเพย์' : payment?.method === 'credit_card' ? 'บัตรเครดิต / เดบิต' : 'ชำระเงิน');
  const paymentConfirmed = payment?.status === 'paid';
  const paymentAwaitingReview = payment?.status === 'awaiting_review';

  return (
    <DashboardLayout
      title={paymentConfirmed ? 'ชำระเงินสำเร็จ' : 'กำลังตรวจสอบการชำระเงิน'}
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-11 w-11 text-emerald-600" />
        </div>
          <h2 className="mt-5 text-2xl font-extrabold text-slate-900">
            {paymentConfirmed ? 'ชำระเงินสำเร็จ 🎉' : paymentAwaitingReview ? 'รอตรวจสอบสลิป' : 'กำลังตรวจสอบการชำระเงิน'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
          {paymentConfirmed
            ? <>การจองเรียนของ <span className="font-bold text-slate-700">{booking.studentName}</span> ได้รับการยืนยันแล้ว</>
            : paymentAwaitingReview
              ? <>ระบบได้รับสลิปของ <span className="font-bold text-slate-700">{booking.studentName}</span> แล้ว ทีมงานกำลังตรวจสอบยอดโอน</>
              : <>ระบบได้รับข้อมูลการชำระเงินของ <span className="font-bold text-slate-700">{booking.studentName}</span> แล้ว กำลังรอการยืนยัน</>}
        </p>

        <div className="mt-7 text-left">
          <PaymentReceipt
            reference={payment?.receiptNumber || payment?.transactionId || payment?.id || '-'}
            courseTitle={booking.courseTitle}
            studentName={booking.studentName}
            methodLabel={methodLabel}
            amount={Number(payment?.amount || booking.totalPrice) || 0}
            lessonDateLabel={`${formatDate(booking.bookingDate, 'd MMM yyyy')} ${formatTime(booking.startTime)}`}
            status={paymentConfirmed ? 'paid' : paymentAwaitingReview ? 'awaiting_review' : 'pending'}
            receiptHref={paymentConfirmed && payment?.id ? `/payments/${payment.id}/receipt` : undefined}
          />
        </div>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/payments">
            <Button variant="outline" className="w-full sm:w-auto">ดูประวัติการชำระเงิน</Button>
          </Link>
          <Link href="/bookings">
            <Button className="w-full sm:w-auto">ไปหน้าการจอง</Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
