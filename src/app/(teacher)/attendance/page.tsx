import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Check, ClipboardCheck, GraduationCap, X, Clock, FileCheck2, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AttendanceStatusBadge, Badge } from '@/components/ui/badge';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { formatTime } from '@/lib/utils';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { releaseEscrowForBooking } from '@/lib/payments/process';
import { releasePackageSessionEscrow } from '@/lib/packages';
import RescheduleForm from '@/components/booking/reschedule-form';
import { hoursUntilSession } from '@/lib/booking-policy';
import { buildAvailableBookingSlots, type AvailabilitySchedule, type AvailabilityBooking } from '@/lib/booking/availability';

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

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; reported?: string }> }) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const params = await searchParams;
  const selectedDate = params.date || today;

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', teacherId)
    .where('bookingDate', '==', selectedDate)
    .where('status', 'in', ['confirmed', 'completed'])
    .orderBy('startTime')
    .get();

  // Serialize เป็น plain object (หลีกเลี่ยง Timestamp class ถูกส่งไป Client Component)
  const bookings = bookingsSnap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      teacherId: data.teacherId,
      parentId: data.parentId,
      studentId: data.studentId,
      studentName: data.studentName,
      studentLevel: data.studentLevel,
      courseId: data.courseId,
      courseTitle: data.courseTitle,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      totalPrice: data.totalPrice,
      lateReschedule: data.lateReschedule === true,
      rescheduleCount: Number(data.rescheduleCount) || 0,
      disputeStatus: data.dispute?.status || null,
    };
  });

  // โหลด attendance ของวันนี้ เพื่อแสดงสถานะเช็คชื่อจริง (มา/ขาด/สาย/รอเช็ค)
  const attendanceSnap = await db.collection(COLLECTIONS.ATTENDANCE)
    .where('teacherId', '==', teacherId)
    .where('sessionDate', '==', selectedDate)
    .get();
  const attendanceStatusByBooking = new Map<string, string>(
    attendanceSnap.docs.map((d: any) => [d.data().bookingId, d.data().status])
  );

  // สถานะรายงานผล — booking ไหนมี session report แล้ว (equality-only ไม่ต้องมี composite index)
  const reportsSnap = await db.collection(COLLECTIONS.SESSION_REPORTS)
    .where('teacherId', '==', teacherId)
    .where('sessionDate', '==', selectedDate)
    .get();
  const reportStatusByBooking = new Set<string>(
    reportsSnap.docs.map((d: any) => String(d.data().bookingId || '')),
  );

  // เตรียมสล็อตว่างสำหรับเลื่อนคาบ (ครูเลื่อนเองได้ — กติกาเดียวกับผู้ปกครอง)
  // สล็อตต่อ booking: ใช้ duration ของคอร์สนั้น ๆ (validateBookingSlot ตรวจอีกชั้นตอนบันทึก)
  let rescheduleSlotsByBooking = new Map<string, { scheduleId: string; date: string; startTime: string; endTime: string }[]>();
  try {
    const [teacherCoursesSnap, schedulesSnap, teacherBookingsSnap] = await Promise.all([
      db.collection(COLLECTIONS.COURSES).where('teacherId', '==', teacherId).where('isActive', '==', true).get(),
      db.collection(COLLECTIONS.SCHEDULES).where('teacherId', '==', teacherId).get(),
      db.collection(COLLECTIONS.BOOKINGS)
        .where('teacherId', '==', teacherId)
        .where('status', 'in', ['pending', 'confirmed'])
        .get(),
    ]);
    const durationsByCourse = new Map<string, number>(
      teacherCoursesSnap.docs.map((d: any) => [d.id, Number(d.data().durationMinutes) || 0]),
    );
    const schedules = schedulesSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }) as AvailabilitySchedule)
      .filter((s) => s.isActive === true);
    const allTeacherBookings = teacherBookingsSnap.docs.map((doc: any) => doc.data() as AvailabilityBooking);
    for (const b of bookings) {
      const duration = durationsByCourse.get(b.courseId) || 0;
      if (b.status !== 'confirmed' || duration <= 0) continue;
      const hours = hoursUntilSession(b.bookingDate, b.startTime);
      if (hours === null || hours <= 0) continue;
      if (b.disputeStatus === 'open') continue; // ระหว่างข้อพิพาทเปิดอยู่ งดเลื่อน
      rescheduleSlotsByBooking.set(
        b.id,
        buildAvailableBookingSlots({
          schedules: schedules.filter((s) => s.courseId === b.courseId),
          bookings: allTeacherBookings,
          courseDurationMinutes: duration,
          fromDate: getBangkokDateString(),
          daysAhead: 60,
        }),
      );
    }
  } catch {
    // query ล้ม (เช่น ยังไม่มี index) — หน้ายังใช้ได้ เพียงไม่มีสล็อตให้เลื่อน
    rescheduleSlotsByBooking = new Map();
  }

  return (
    <DashboardLayout
      title="เช็คชื่อ"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      {params.reported === '1' && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          ✅ บันทึกรายงานผลการเรียนแล้ว — ผู้ปกครองได้รับแจ้งแล้ว
        </p>
      )}

      <div className="responsive-page-header mb-6">
        <p className="text-sm text-slate-500">บันทึกการเข้าเรียนของนักเรียน</p>
        <form method="get" className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="date" name="date" defaultValue={selectedDate}
            className="min-h-[44px] rounded-xl border border-pink-100 bg-white/90 px-3 py-2 text-base text-slate-900 shadow-inner-lg focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100/60 sm:text-sm" />
          <Button type="submit" size="sm" variant="outline" className="w-full sm:w-auto">ดูวันที่</Button>
        </form>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="ไม่มีเซสชันวันนี้"
          description="เลือกวันที่อื่นเพื่อดูตารางเช็คชื่อ"
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking: any) => (
            <Card key={booking.id}>
              <div className="responsive-card-row">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{booking.studentName}</h3>
                    {booking.studentLevel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-700">
                        <GraduationCap className="h-3 w-3" />
                        {booking.studentLevel}
                      </span>
                    )}
                    {booking.lateReschedule && <Badge variant="warning" size="sm" dot>เลื่อนล่าช้า</Badge>}
                    {booking.rescheduleCount > 0 && <Badge variant="info" size="sm">เลื่อน {booking.rescheduleCount} ครั้ง</Badge>}
                    {booking.disputeStatus === 'open' && <Badge variant="danger" size="sm" dot>ข้อพิพาท</Badge>}
                    <AttendanceStatusBadge status={attendanceStatusByBooking.get(booking.id) || 'pending'} />
                    {reportStatusByBooking.has(booking.id) && <Badge variant="success" size="sm">มีรายงานแล้ว</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {booking.courseTitle} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                  </p>
                </div>
                <div className="w-full space-y-2 sm:w-auto">
                  {booking.status === 'completed' && (
                    <Link href={`/attendance/report/${booking.id}`} className="block w-full">
                      <Button size="sm" variant={reportStatusByBooking.has(booking.id) ? 'outline' : 'primary'} className="w-full">
                        <FileCheck2 className="h-4 w-4" />
                        {reportStatusByBooking.has(booking.id) ? 'แก้รายงาน' : 'เขียนรายงาน'}
                      </Button>
                    </Link>
                  )}
                  <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
                  {['present', 'absent', 'late'].map((status) => (
                    <form key={status} action={async () => {
                      'use server';
                      const dbRef = getServerDb();
                      if (!dbRef) return;
                      const current = (await requireRole(['teacher'])).session;
                      if (current.uid !== teacherId) return;
                      const bookingRef = dbRef.collection(COLLECTIONS.BOOKINGS).doc(booking.id);
                      const currentBooking = await bookingRef.get();
                      if (!currentBooking.exists || currentBooking.data()?.teacherId !== current.uid) return;
                      // Deterministic doc ID — double-submit/retry overwrites instead
                      // of creating a duplicate attendance record.
                      await dbRef.collection(COLLECTIONS.ATTENDANCE).doc(`${booking.id}_${selectedDate}`).set({
                        bookingId: booking.id,
                        courseId: booking.courseId,
                        teacherId,
                        studentName: booking.studentName,
                        sessionDate: selectedDate,
                        status,
                        checkInTime: status === 'present' ? FieldValue.serverTimestamp() : null,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                      }, { merge: true });

                      // ถ้านักเรียนมาเรียน → จบเซสชัน + ปล่อย escrow (ย้าย pending → available)
                      // - จองปกติ: ปล่อยทั้งก้อนของ payment นั้น (releaseEscrowForBooking)
                      // - จองด้วยเครดิตแพ็กเกจ: ปล่อยรายครั้ง (releasePackageSessionEscrow)
                      if (status === 'present' && booking.status === 'confirmed') {
                        await bookingRef.update({
                          status: 'completed',
                          updatedAt: FieldValue.serverTimestamp(),
                        });
                        if ((currentBooking.data() as any)?.paidWithCredit) {
                          await releasePackageSessionEscrow(dbRef, booking.id);
                        } else {
                          await releaseEscrowForBooking(dbRef, booking.id);
                        }
                      }
                    }}>
                      <Button type="submit" size="sm" variant={status === 'present' ? 'primary' : 'outline'} className="w-full">
                        {status === 'present' ? <><Check className="h-4 w-4" /> มา</> :
                         status === 'absent' ? <><X className="h-4 w-4" /> ขาด</> :
                         <><Clock className="h-4 w-4" /> สาย</>}
                      </Button>
                    </form>
                  ))}
                  </div>
                </div>
              </div>

              {/* เลื่อนคาบฝั่งครู — กติกาเดียวกับผู้ปกครอง (ฟรี 2 ครั้ง ≥24 ชม., สายติดธง) */}
              {rescheduleSlotsByBooking.has(booking.id) && (
                <details className="mt-3 rounded-xl border border-pink-100 bg-pink-50/40 px-4 py-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                    <CalendarClock className="h-4 w-4 text-pink-600" />
                    เลื่อนคาบนี้ (ผู้ปกครองได้รับแจ้งอัตโนมัติ)
                  </summary>
                  <div className="mt-3">
                    <RescheduleForm
                      bookingId={booking.id}
                      slots={rescheduleSlotsByBooking.get(booking.id) || []}
                      rescheduleCount={booking.rescheduleCount}
                      currentSlot={{
                        date: booking.bookingDate,
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                      }}
                    />
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
