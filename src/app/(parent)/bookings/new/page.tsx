import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { StudentPicker } from '@/components/booking/student-picker';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { formatCurrency } from '@/lib/utils';
import { Users } from 'lucide-react';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { createPaymentForBooking } from '@/lib/payments/process';
import {
  buildAvailableBookingSlots,
  validateBookingSlot,
  type AvailabilityBooking,
  type AvailabilitySchedule,
} from '@/lib/booking/availability';

class BookingSlotError extends Error {
  constructor(public readonly code: 'slot_unavailable' | 'booking_conflict' | 'student') {
    super(code);
    this.name = 'BookingSlotError';
  }
}

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

function formatSlotLabel(date: string, startTime: string, endTime: string): string {
  const formattedDate = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00+07:00`));
  return `${formattedDate} เวลา ${startTime} - ${endTime} น.`;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string; error?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const userId = session.uid;
  const parentId = session.uid;

  const params = await searchParams;
  const courseId = params.course_id;

  if (!courseId) redirect('/explore');
  const resolvedCourseId = String(courseId);

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(resolvedCourseId).get();

  if (!courseSnap.exists) {
    return (
      <DashboardLayout title="จองเรียน" navItems={PARENT_NAV_ITEMS} role="parent"      userName={session.displayName || 'ผู้ปกครอง'}>
        <div className="text-center py-12">
          <p className="text-gray-500">ไม่พบคอร์สเรียน</p>
          <a href="/explore" className="text-pink-600 hover:underline">กลับไปค้นหาครู</a>
        </div>
      </DashboardLayout>
    );
  }

  const course = { id: courseSnap.id, ...courseSnap.data() } as any;

  const schedulesSnap = await db.collection(COLLECTIONS.SCHEDULES)
    .where('courseId', '==', resolvedCourseId)
    .get();
  const schedules = schedulesSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }) as AvailabilitySchedule)
    .filter((schedule) => schedule.isActive === true);

  const teacherBookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', course.teacherId)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  const teacherBookings = teacherBookingsSnap.docs
    .map((doc: any) => doc.data() as AvailabilityBooking);

  const availableSlots = buildAvailableBookingSlots({
    schedules,
    bookings: teacherBookings,
    courseDurationMinutes: Number(course.durationMinutes) || 0,
    fromDate: getBangkokDateString(),
    daysAhead: 90,
  });

  const slotOptions = [
    { value: '', label: '-- เลือกวันและเวลาที่ครูเปิดไว้ --' },
    ...availableSlots.map((slot) => ({
      value: JSON.stringify(slot),
      label: formatSlotLabel(slot.date, slot.startTime, slot.endTime),
    })),
  ];

  const studentsSnap = await db.collection(COLLECTIONS.STUDENTS)
    .where('parentId', '==', parentId)
    .get();
  // Serialize to plain objects — Firestore Timestamps (class instances) can't cross
  // the Server → Client component boundary.
  const students = [...studentsSnap.docs]
    .sort((a: any, b: any) => {
      const aCreatedAt = a.data().createdAt?.toMillis?.() || 0;
      const bCreatedAt = b.data().createdAt?.toMillis?.() || 0;
      return aCreatedAt - bCreatedAt;
    })
    .map((doc: any) => {
    const data = doc.data();
    return { id: doc.id, name: data.name, level: data.level };
    });

  async function createBooking(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = await requireRole(['parent']);
    if (current.session.uid !== userId) return;

    const redirectWithError = (error: string) => {
      redirect(`/bookings/new?course_id=${encodeURIComponent(String(courseId))}&error=${encodeURIComponent(error)}`);
    };

    const rawSlot = String(formData.get('schedule_slot') || '');
    let selectedSlot: { scheduleId: string; date: string; startTime: string; endTime: string } | null = null;
    try {
      const parsed = JSON.parse(rawSlot) as Record<string, unknown>;
      if (
        typeof parsed.scheduleId === 'string' &&
        typeof parsed.date === 'string' &&
        typeof parsed.startTime === 'string' &&
        typeof parsed.endTime === 'string'
      ) {
        selectedSlot = {
          scheduleId: parsed.scheduleId,
          date: parsed.date,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
        };
      }
    } catch {
      // The server-side validation below remains the source of truth.
    }
    if (!selectedSlot) {
      redirectWithError('slot_unavailable');
      return;
    }

    const studentId = formData.get('student_id') as string;
    const isNewStudent = studentId === '__new__';
    if (!studentId) {
      redirectWithError('student');
      return;
    }

    const enteredStudentName = formData.get('student_name') as string;
    const enteredStudentLevel = formData.get('student_level') as string || null;
    const studentRef = isNewStudent
      ? dbRef.collection(COLLECTIONS.STUDENTS).doc()
      : studentId
        ? dbRef.collection(COLLECTIONS.STUDENTS).doc(studentId)
        : null;
    const bookingRef = dbRef.collection(COLLECTIONS.BOOKINGS).doc();
    let bookingForPayment: {
      id: string;
      parentId: string;
      teacherId: string;
      studentName: string;
      courseTitle: string;
      totalPrice: number;
    } | null = null;

    try {
      await dbRef.runTransaction(async (transaction) => {
        const courseRef = dbRef.collection(COLLECTIONS.COURSES).doc(resolvedCourseId);
        const scheduleRef = dbRef.collection(COLLECTIONS.SCHEDULES).doc(selectedSlot!.scheduleId);
        const conflictsQuery = dbRef.collection(COLLECTIONS.BOOKINGS)
          .where('teacherId', '==', course.teacherId)
          .where('bookingDate', '==', selectedSlot!.date)
          .where('status', 'in', ['pending', 'confirmed']);

        const freshCourseSnap = await transaction.get(courseRef);
        const scheduleSnap = await transaction.get(scheduleRef);
        const conflictsSnap = await transaction.get(conflictsQuery);
        const studentSnap = studentRef && !isNewStudent ? await transaction.get(studentRef) : null;

        const freshCourse = freshCourseSnap.exists
          ? { id: freshCourseSnap.id, ...freshCourseSnap.data() } as any
          : null;
        const schedule = scheduleSnap.exists
          ? { id: scheduleSnap.id, ...scheduleSnap.data() } as AvailabilitySchedule
          : null;

        if (
          !freshCourse ||
          freshCourse.isActive !== true ||
          freshCourse.teacherId !== course.teacherId ||
          !schedule ||
          schedule.courseId !== resolvedCourseId ||
          schedule.teacherId !== freshCourse.teacherId
        ) {
          throw new BookingSlotError('slot_unavailable');
        }

        const validation = validateBookingSlot({
          schedule,
          bookingDate: selectedSlot!.date,
          startTime: selectedSlot!.startTime,
          endTime: selectedSlot!.endTime,
          courseDurationMinutes: Number(freshCourse.durationMinutes) || 0,
          bookings: conflictsSnap.docs.map((doc: any) => doc.data() as AvailabilityBooking),
        });
        if (!validation.ok) {
          throw new BookingSlotError(validation.reason === 'booking_conflict' ? 'booking_conflict' : 'slot_unavailable');
        }

        let studentName = enteredStudentName;
        let studentLevel = enteredStudentLevel;
        if (studentSnap) {
          const student = studentSnap.exists ? studentSnap.data() as any : null;
          if (!student || student.parentId !== current.session.uid) {
            throw new BookingSlotError('student');
          }
          studentName = student.name;
          studentLevel = student.level || null;
        }

        if (isNewStudent && studentRef) {
          transaction.create(studentRef, {
            parentId,
            name: studentName,
            level: studentLevel,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.create(bookingRef, {
          courseId,
          courseTitle: freshCourse.title,
          teacherId: freshCourse.teacherId,
          teacherName: freshCourse.teacherName,
          parentId: userId,
          studentId: studentRef?.id || null,
          studentName,
          studentLevel,
          bookingDate: validation.slot.date,
          startTime: validation.slot.startTime,
          endTime: validation.slot.endTime,
          totalPrice: freshCourse.pricePerSession,
          notes: formData.get('notes') as string || null,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        bookingForPayment = {
          id: bookingRef.id,
          parentId: userId,
          teacherId: freshCourse.teacherId,
          studentName,
          courseTitle: freshCourse.title,
          totalPrice: freshCourse.pricePerSession,
        };
      });
    } catch (error) {
      if (error instanceof BookingSlotError) {
        redirectWithError(error.code);
        return;
      }
      throw error;
    }

    if (!bookingForPayment) {
      redirectWithError('slot_unavailable');
      return;
    }

    // สร้าง payment record (รอชำระเงิน) — escrow model
    await createPaymentForBooking(dbRef, bookingForPayment);

    redirect(`/bookings/${bookingRef.id}/payment`);
  }

  return (
    <DashboardLayout title="จองเรียน" navItems={PARENT_NAV_ITEMS} role="parent"      userName={session.displayName || 'ผู้ปกครอง'}>
      <Card className="mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 font-bold text-xl text-pink-700">
            {(course.teacherName?.[0] || 'ค').toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">{course.title}</h2>
            <p className="text-sm text-gray-500">
              ครู{course.teacherName} • {course.subjectName} • ระดับ {course.level}
            </p>
            <p className="text-sm font-semibold text-pink-700">{formatCurrency(course.pricePerSession)} / เซสชัน</p>
          </div>
        </div>
      </Card>

      <form action={createBooking} className="space-y-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">ข้อมูลนักเรียน</h3>
            <Link href="/my-students" className="inline-flex items-center gap-1 text-xs font-bold text-pink-600 hover:underline">
              <Users className="h-3.5 w-3.5" />
              จัดการรายชื่อลูก
            </Link>
          </div>

          <StudentPicker students={students} />
        </Card>

        <Card className="space-y-4">
          <h3 className="font-semibold text-gray-900">วันที่และเวลา</h3>
          <Select
            label="เลือกช่วงเวลาที่ครูเปิดไว้"
            name="schedule_slot"
            options={slotOptions}
            required
            disabled={availableSlots.length === 0}
            helperText="วันและเวลานี้มาจากตารางสอนของครูโดยตรง"
          />
          {availableSlots.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {schedules.length === 0
                ? 'ครูยังไม่ได้เปิดตารางสอนสำหรับคอร์สนี้'
                : 'ขณะนี้ไม่มีช่วงเวลาว่างใน 90 วันข้างหน้า กรุณากลับมาเลือกใหม่ภายหลัง'}
            </p>
          )}
          {params.error === 'booking_conflict' && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น
            </p>
          )}
          {params.error === 'slot_unavailable' && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              ช่วงเวลาที่เลือกไม่ตรงกับตารางครูหรือไม่ว่างแล้ว กรุณาเลือกจากรายการใหม่
            </p>
          )}
          {params.error === 'student' && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              ไม่พบข้อมูลนักเรียนหรือคุณไม่มีสิทธิ์ใช้ข้อมูลนี้ กรุณาเลือกนักเรียนใหม่
            </p>
          )}
          <Textarea label="หมายเหตุถึงครู (ถ้ามี)" name="notes" placeholder="เช่น ต้องการเน้นเรื่อง..." />
        </Card>

        <div className="responsive-actions">
          <Button type="submit" disabled={availableSlots.length === 0} className="w-full sm:w-auto">ยืนยันการจอง</Button>
          <Link href="/explore" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
