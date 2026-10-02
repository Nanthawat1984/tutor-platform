import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, CreditCard, Flag, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PAYMENT_METHODS } from '@/lib/payments/config';
import StartChatButton from '@/components/chat/start-chat-button';
import RescheduleForm from '@/components/booking/reschedule-form';
import DisputeForm from '@/components/booking/dispute-form';
import CancelBookingButton from '@/components/booking/cancel-booking-button';
import {
  buildAvailableBookingSlots,
  type AvailabilityBooking,
  type AvailabilitySchedule,
} from '@/lib/booking/availability';
import { hoursUntilSession } from '@/lib/booking-policy';

function getBangkokDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

  // ── เลื่อนคาบ (self-service): เตรียมสล็อตว่างจากตารางครู เหมือนหน้าจองใหม่ ──
  const disputeOpen = booking.dispute?.status === 'open';
  const canSelfServe = (booking.status === 'confirmed' || booking.status === 'pending') && !disputeOpen;
  const hoursToSession = hoursUntilSession(booking.bookingDate, booking.startTime);
  const canReschedule = canSelfServe && hoursToSession !== null && hoursToSession > 0;
  let rescheduleSlots: { scheduleId: string; date: string; startTime: string; endTime: string }[] = [];
  if (canReschedule) {
    const [courseSnap, schedulesSnap, teacherBookingsSnap] = await Promise.all([
      db.collection(COLLECTIONS.COURSES).doc(booking.courseId).get(),
      db.collection(COLLECTIONS.SCHEDULES).where('courseId', '==', booking.courseId).get(),
      db.collection(COLLECTIONS.BOOKINGS)
        .where('teacherId', '==', booking.teacherId)
        .where('status', 'in', ['pending', 'confirmed'])
        .get(),
    ]);
    const courseDurationMinutes = Number(courseSnap.data()?.durationMinutes) || 0;
    const schedules = schedulesSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }) as AvailabilitySchedule)
      .filter((schedule) => schedule.isActive === true);
    // ตัดการจอง "ตัวเอง" ออก — ไม่งั้นสล็อตปัจจุบันของตัวเองจะถูกมองว่าชน
    const teacherBookings = teacherBookingsSnap.docs
      .filter((doc: any) => doc.id !== booking.id)
      .map((doc: any) => doc.data() as AvailabilityBooking);
    rescheduleSlots = buildAvailableBookingSlots({
      schedules,
      bookings: teacherBookings,
      courseDurationMinutes,
      fromDate: getBangkokDateString(),
      daysAhead: 60,
    });
  }

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

          {booking.lateReschedule === true && booking.rescheduleCount > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <Flag className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                การจองนี้ถูกเลื่อนโดยแจ้งล่วงหน้าน้อยกว่า 24 ชม. (ธงเลื่อนสาย) —
                ครูสามารถเปิดข้อพิพาทจากการเลื่อนครั้งนี้ได้
              </span>
            </div>
          )}
        </Card>

        {disputeOpen && (
          <Card className="border-rose-200 bg-rose-50/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="min-w-0 text-sm">
                <h3 className="font-bold text-rose-700">ข้อพิพาทของการจองนี้กำลังถูกตรวจสอบ</h3>
                <p className="mt-1 text-slate-600">
                  สาเหตุ: {booking.dispute?.reason || '-'}</p>
                {booking.dispute?.note && <p className="mt-1 text-slate-500">รายละเอียด: {booking.dispute.note}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {booking.dispute?.filedBy === 'parent' ? 'คุณเป็นผู้เปิดข้อพิพาทนี้' : 'ครูเป็นผู้เปิดข้อพิพาทนี้'} —
                  ระหว่างรอผลตัดสินจากแอดมิน การเลื่อนคาบจะถูกระงับชั่วคราว
                </p>
              </div>
            </div>
          </Card>
        )}

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

        {canReschedule && (
          <RescheduleForm
            bookingId={bookingId}
            slots={rescheduleSlots}
            rescheduleCount={Number(booking.rescheduleCount) || 0}
            currentSlot={{
              date: booking.bookingDate,
              startTime: booking.startTime,
              endTime: booking.endTime,
            }}
          />
        )}

        {canSelfServe && (
          <>
            <div>
              <h3 className="mb-2 font-bold text-slate-900">ยกเลิกคลาส</h3>
              <p className="mb-3 text-xs text-slate-500">
                ยกเลิกแล้วกู้คืนไม่ได้ — เงินคืนเป็นเครดิตวอลเล็ต (ยกเลิกล่วงหน้า ≥ 24 ชม. คืนเต็ม, สายคืน 50%)
              </p>
              <CancelBookingButton bookingId={bookingId} />
            </div>

            <DisputeForm bookingId={bookingId} />
          </>
        )}

        <div>
          <h3 className="mb-2 font-bold text-slate-900">คุยกับครู</h3>
          <p className="mb-3 text-xs text-slate-500">
            เปิดห้องสนทนากับครูเจ้าของรายการนี้ — ข้อความเดินถึงกันทันที ไม่ต้องรอรีเฟรช
          </p>
          <StartChatButton
            teacherId={booking.teacherId}
            bookingId={bookingId}
            label="เปิดห้องสนทนา"
            variant="primary"
          />
        </div>

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
