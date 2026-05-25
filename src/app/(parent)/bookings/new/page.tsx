import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { formatCurrency, formatTime } from '@/lib/utils';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const userId = 'temp-user-id';

  const params = await searchParams;
  const courseId = params.course_id;

  if (!courseId) redirect('/explore');

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(courseId).get();

  if (!courseSnap.exists) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">ไม่พบคอร์สเรียน</p>
        <a href="/explore" className="text-blue-600 hover:underline">กลับไปค้นหาครู</a>
      </div>
    );
  }

  const course = { id: courseSnap.id, ...courseSnap.data() } as any;

  async function createBooking(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    await dbRef.collection(COLLECTIONS.BOOKINGS).add({
      courseId,
      courseTitle: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      parentId: userId,
      studentName: formData.get('student_name') as string,
      studentLevel: formData.get('student_level') as string || null,
      bookingDate: formData.get('booking_date') as string,
      startTime: formData.get('start_time') as string,
      endTime: formData.get('end_time') as string,
      totalPrice: course.pricePerSession,
      notes: formData.get('notes') as string || null,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/bookings?success=1');
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">จองเรียน</h1>

      <Card className="mt-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
            {(course.teacherName?.[0] || 'ค').toUpperCase()}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{course.title}</h2>
            <p className="text-sm text-gray-500">
              ครู{course.teacherName} • {course.subjectName} • ระดับ {course.level}
            </p>
            <p className="text-sm font-semibold text-blue-600">{formatCurrency(course.pricePerSession)} / เซสชัน</p>
          </div>
        </div>
      </Card>

      <form action={createBooking} className="mt-6 space-y-6">
        <Card className="space-y-4">
          <h3 className="font-semibold text-gray-900">ข้อมูลนักเรียน</h3>
          <Input label="ชื่อ-นามสกุล นักเรียน" name="student_name" required placeholder="ชื่อลูกคุณ" />
          <Input label="ระดับชั้น" name="student_level" placeholder="เช่น ป.4, ม.2" />
        </Card>

        <Card className="space-y-4">
          <h3 className="font-semibold text-gray-900">วันที่และเวลา</h3>
          <Input label="วันที่เรียน" name="booking_date" type="date" required min={new Date().toISOString().split('T')[0]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="เวลาเริ่ม" name="start_time" type="time" required />
            <Input label="เวลาสิ้นสุด" name="end_time" type="time" required />
          </div>
          <Textarea label="หมายเหตุถึงครู (ถ้ามี)" name="notes" placeholder="เช่น ต้องการเน้นเรื่อง..." />
        </Card>

        <div className="flex gap-3">
          <Button type="submit">ยืนยันการจอง</Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>ยกเลิก</Button>
        </div>
      </form>
    </div>
  );
}


export const dynamic = 'force-dynamic';
