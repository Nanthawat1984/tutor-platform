import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Receipt, CalendarDays, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PAYMENT_METHODS } from '@/lib/payments/config';

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
            {paymentConfirmed ? 'ชำระเงินสำเร็จ 🎉' : 'กำลังตรวจสอบการชำระเงิน'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
          {paymentConfirmed
            ? <>การจองเรียนของ <span className="font-bold text-slate-700">{booking.studentName}</span> ได้รับการยืนยันแล้ว</>
            : <>ระบบได้รับข้อมูลการชำระเงินของ <span className="font-bold text-slate-700">{booking.studentName}</span> แล้ว กำลังรอ Stripe ยืนยัน</>}
        </p>

        {/* ใบเสร็จ */}
        <Card className="mt-7 text-left">
          <div className="flex items-center justify-between border-b border-pink-100 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-pink-600" />
              <span className="font-bold text-slate-900">ใบเสร็จรับเงิน</span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200">
              {paymentConfirmed ? 'ชำระแล้ว' : 'กำลังตรวจสอบ'}
            </span>
          </div>

          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">เลขที่อ้างอิง</span>
              <span className="font-mono text-xs font-bold text-slate-700">
                {payment?.transactionId || payment?.id || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">รายการ</span>
              <span className="font-semibold text-slate-800">{booking.courseTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">นักเรียน</span>
              <span className="font-semibold text-slate-800">{booking.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">วิธีชำระ</span>
              <span className="font-semibold text-slate-800">{methodLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">วันที่เรียน</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(booking.bookingDate, 'd MMM yyyy')}
                <Clock className="ml-1 h-3.5 w-3.5" /> {formatTime(booking.startTime)}
              </span>
            </div>
            <div className="flex justify-between border-t border-pink-100 pt-2.5">
              <span className="font-bold text-slate-900">ยอดชำระ</span>
              <span className="text-lg font-extrabold text-pink-700">
                {formatCurrency(payment?.amount || booking.totalPrice)}
              </span>
            </div>
          </div>
        </Card>

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
