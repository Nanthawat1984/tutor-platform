import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Clock, CreditCard, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PAYMENT_METHODS } from '@/lib/payments/config';

export default async function BookingDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id: bookingId } = await params;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) return redirect('/bookings');
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.parentId !== session.uid) return redirect('/bookings');

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('bookingId', '==', bookingId)
    .limit(10)
    .get();
  const payment = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    })[0] || null;
  const methodLabel = payment
    ? PAYMENT_METHODS.find((method) => method.id === payment.method)?.label
      || (payment.method === 'bank_transfer' ? 'โอนเงิน / สลิป' : 'ชำระเงิน')
    : '-';

  return (
    <DashboardLayout
      title="รายละเอียดการจอง"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับรายการจอง
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pink-100 pb-4">
            <div>
              <p className="text-xs text-slate-500">หมายเลขการจอง</p>
              <h2 className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{booking.id}</h2>
              <p className="mt-2 text-lg font-extrabold text-slate-900">{booking.courseTitle || 'คอร์สเรียน'}</p>
              <p className="text-sm text-slate-500">ครู{booking.teacherName || '-'}</p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>

          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div><p className="text-xs text-slate-500">วันที่เรียน</p><p className="font-semibold text-slate-800">{formatDate(booking.bookingDate, 'd MMMM yyyy')}</p></div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div><p className="text-xs text-slate-500">เวลา</p><p className="font-semibold text-slate-800">{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</p></div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div><p className="text-xs text-slate-500">สถานที่</p><p className="font-semibold text-slate-800">{booking.centerName || booking.locationName || (booking.isOnline ? 'เรียนออนไลน์' : 'รอยืนยันสถานที่')}</p></div>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div><p className="text-xs text-slate-500">นักเรียน / ยอดรวม</p><p className="font-semibold text-slate-800">{booking.studentName || '-'} • {formatCurrency(Number(booking.totalPrice) || 0)}</p></div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">สถานะการชำระเงิน</h3>
              <p className="mt-1 text-xs text-slate-500">สถานะนี้ผูกกับการจองรายการนี้โดยตรง</p>
            </div>
            {payment ? <PaymentStatusBadge status={payment.status} /> : <span className="text-sm text-slate-500">ยังไม่มีรายการชำระเงิน</span>}
          </div>
          {payment && (
            <div className="mt-4 grid gap-2 border-t border-pink-100 pt-4 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">วิธีชำระ:</span> <span className="font-semibold text-slate-800">{methodLabel}</span></p>
              <p><span className="text-slate-500">ยอด:</span> <span className="font-semibold text-slate-800">{formatCurrency(Number(payment.amount) || 0)}</span></p>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          {payment?.status === 'paid' && (
            <Link href={`/payments/${payment.id}/receipt`}><Button>ดูใบเสร็จรับเงิน</Button></Link>
          )}
          {booking.status === 'pending' && payment?.status !== 'cancelled' && (
            <Link href={`/bookings/${bookingId}/payment`}><Button>ไปหน้าชำระเงิน</Button></Link>
          )}
          <Link href="/bookings"><Button variant="outline">กลับรายการจอง</Button></Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
