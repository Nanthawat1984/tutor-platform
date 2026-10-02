import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, CreditCard, Flag, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { AttendanceStatusBadge, BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
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

// /sessions/[id] — รายละเอียดคลาสฝั่งครู (คู่ของ /bookings/[id] ฝั่งผู้ปกครอง)
// ครูจัดการคลาสของตัวเองได้ครบ: เลื่อนคาบ / เปิดข้อพิพาท / ยกเลิก / ทักผู้ปกครอง
export default async function TeacherSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id: bookingId } = await params;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) return redirect('/attendance');
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;

  // Role guard — หน้านี้เฉพาะครูเจ้าของคลาส
  if (booking.teacherId !== session.uid) redirect('/attendance');

  const [paymentsSnap, attendanceSnap] = await Promise.all([
    db.collection(COLLECTIONS.PAYMENTS).where('bookingId', '==', bookingId).limit(10).get(),
    db.collection(COLLECTIONS.ATTENDANCE).where('bookingId', '==', bookingId).limit(5).get(),
  ]);
  const payment = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    })[0] || null;
  const attendance = attendanceSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.sessionDate || '';
      const tb = b.sessionDate || '';
      return tb.localeCompare(ta);
    })[0] || null;
  const methodLabel = payment
    ? PAYMENT_METHODS.find((m) => m.id === payment.method)?.label
      || (payment.method === 'bank_transfer' ? 'โอนเงิน / สลิป' : 'ชำระเงิน')
    : '-';

  // ── เลื่อนคาบ: เตรียมสล็อตว่างจากตารางครู (เหมือนหน้ารายละเอียดฝั่งผู้ปกครอง) ──
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
        .where('teacherId', '==', session.uid)
        .where('status', 'in', ['pending', 'confirmed'])
        .get(),
    ]);
    const courseDurationMinutes = Number(courseSnap.data()?.durationMinutes) || 0;
    const schedules = schedulesSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }) as AvailabilitySchedule)
      .filter((schedule) => schedule.isActive === true);
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
      title="รายละเอียดคลาส"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/attendance" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับหน้าเช็คชื่อ
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pink-100 pb-4">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">หมายเลขการจอง</p>
              <h2 className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{booking.id}</h2>
              <p className="mt-2 text-lg font-extrabold text-slate-900">{booking.courseTitle || 'คอร์สเรียน'}</p>
              <p className="text-sm text-slate-500">
                นักเรียน: {booking.studentName || '-'}
                {booking.studentLevel ? ` (${booking.studentLevel})` : ''}
              </p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>

          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div>
                <p className="text-xs text-slate-500">วันที่สอน</p>
                <p className="font-semibold text-slate-800">{formatDate(booking.bookingDate, 'd MMMM yyyy')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div>
                <p className="text-xs text-slate-500">เวลา</p>
                <p className="font-semibold text-slate-800">{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div>
                <p className="text-xs text-slate-500">สถานที่</p>
                <p className="font-semibold text-slate-800">
                  {booking.centerName || booking.locationName || (booking.isOnline ? 'เรียนออนไลน์' : 'รอยืนยันสถานที่')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
              <div>
                <p className="text-xs text-slate-500">ค่าเรียน</p>
                <p className="font-semibold text-slate-800">{formatCurrency(Number(booking.totalPrice) || 0)}</p>
              </div>
            </div>
          </div>

          {(booking.lateReschedule === true || Number(booking.rescheduleCount) > 0) && (
            <div className="mt-4 flex flex-wrap items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <Flag className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                เลื่อนคาบแล้ว {Number(booking.rescheduleCount) || 0} ครั้ง
                {booking.lateReschedule === true ? ' (ครั้งล่าสุดแจ้งล่วงหน้าน้อยกว่า 24 ชม.)' : ''}
              </span>
            </div>
          )}
        </Card>

        {disputeOpen && (
          <Card className="border-rose-200 bg-rose-50/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="min-w-0 text-sm">
                <h3 className="font-bold text-rose-700">ข้อพิพาทของคลาสนี้กำลังถูกตรวจสอบ</h3>
                <p className="mt-1 text-slate-600">สาเหตุ: {booking.dispute?.reason || '-'}</p>
                {booking.dispute?.note && <p className="mt-1 text-slate-500">รายละเอียด: {booking.dispute.note}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  เปิดโดย{booking.dispute?.filedBy === 'teacher' ? 'คุณ' : 'ผู้ปกครอง'} — ระหว่างรอผลตัดสิน
                  การเลื่อนคาบ/ยกเลิกถูกระงับชั่วคราว
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">สถานะการชำระเงิน &amp; การเข้าเรียน</h3>
              <p className="mt-1 text-xs text-slate-500">ข้อมูลจากรายการชำระเงินและการเช็คชื่อของคลาสนี้</p>
            </div>
            <div className="flex items-center gap-2">
              {payment ? <PaymentStatusBadge status={payment.status} /> : <span className="text-sm text-slate-500">ยังไม่มีรายการชำระเงิน</span>}
              {attendance && <AttendanceStatusBadge status={attendance.status} />}
            </div>
          </div>
          <div className="mt-4 grid gap-2 border-t border-pink-100 pt-4 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">วิธีชำระ:</span> <span className="font-semibold text-slate-800">{methodLabel}</span></p>
            <p>
              <span className="text-slate-500">ยอดที่ชำระ:</span>{' '}
              <span className="font-semibold text-slate-800">{formatCurrency(Number(payment?.amount) || 0)}</span>
            </p>
            {payment?.paidWithCredit && (
              <p className="sm:col-span-2 text-xs text-slate-500">การจองนี้ใช้เครดิตแพ็กเกจ (ยกเลิกก่อน 24 ชม. คืน 1 เครดิต)</p>
            )}
            {Number(booking.walletApplied) > 0 && (
              <p className="sm:col-span-2 text-xs text-slate-500">
                ผู้ปกครองใช้เครดิตวอลเล็ต {formatCurrency(Number(booking.walletApplied) || 0)} ร่วมชำระ
              </p>
            )}
          </div>
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
                ใช้เมื่อสอนไม่ได้จริง (เช่น ป่วย/ติดธุระ) — ควรแจ้งผู้ปกครองในแชทก่อน
                ยกเลิกล่วงหน้า ≥ 24 ชม. ผู้ปกครองได้คืนเต็ม สายคืน 50%
              </p>
              <CancelBookingButton bookingId={bookingId} label="ยกเลิกคลาสนี้" />
            </div>

            <DisputeForm bookingId={bookingId} />
          </>
        )}

        {booking.status === 'completed' && (
          <Link href={`/attendance/report/${booking.id}`} className="block w-full sm:w-auto">
            <Button className="w-full sm:w-auto">เขียน/แก้รายงานผลการเรียน</Button>
          </Link>
        )}

        <div>
          <h3 className="mb-2 font-bold text-slate-900">คุยกับผู้ปกครอง</h3>
          <p className="mb-3 text-xs text-slate-500">
            เปิดห้องสนทนาของคลาสนี้ — ข้อความเดินถึงกันทันที ไม่ต้องรอรีเฟรช
          </p>
          <StartChatButton
            parentId={booking.parentId}
            bookingId={bookingId}
            label="ทักผู้ปกครอง"
            variant="primary"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';