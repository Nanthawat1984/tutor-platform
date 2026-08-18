import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { StudentPicker } from '@/components/booking/student-picker';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { formatCurrency } from '@/lib/utils';
import { Users } from 'lucide-react';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const userId = 'temp-user-id';
  const parentId = 'temp-parent-id';

  const params = await searchParams;
  const courseId = params.course_id;

  if (!courseId) redirect('/explore');

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(courseId).get();

  if (!courseSnap.exists) {
    return (
      <DashboardLayout title="จองเรียน" navItems={PARENT_NAV_ITEMS} role="parent" userName="ผู้ปกครอง">
        <div className="text-center py-12">
          <p className="text-gray-500">ไม่พบคอร์สเรียน</p>
          <a href="/explore" className="text-pink-600 hover:underline">กลับไปค้นหาครู</a>
        </div>
      </DashboardLayout>
    );
  }

  const course = { id: courseSnap.id, ...courseSnap.data() } as any;

  const studentsSnap = await db.collection(COLLECTIONS.STUDENTS)
    .where('parentId', '==', parentId)
    .orderBy('createdAt', 'asc')
    .get();
  const students = studentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  async function createBooking(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    const studentId = formData.get('student_id') as string;
    const isNewStudent = studentId === '__new__';

    let studentName = formData.get('student_name') as string;
    let studentLevel = formData.get('student_level') as string || null;

    // เลือกจากรายชื่อที่มีอยู่ → ดึงข้อมูลจากรายการ
    if (studentId && !isNewStudent) {
      const studentSnap = await dbRef.collection(COLLECTIONS.STUDENTS).doc(studentId).get();
      if (studentSnap.exists) {
        const student = studentSnap.data() as any;
        studentName = student.name;
        studentLevel = student.level || null;
      }
    } else if (isNewStudent) {
      // นักเรียนใหม่ → บันทึกลงรายชื่อผู้ปกครองด้วย (เพื่อใช้ครั้งหน้า)
      await dbRef.collection(COLLECTIONS.STUDENTS).add({
        parentId,
        name: studentName,
        level: studentLevel,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await dbRef.collection(COLLECTIONS.BOOKINGS).add({
      courseId,
      courseTitle: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      parentId: userId,
      studentId: studentId && !isNewStudent ? studentId : null,
      studentName,
      studentLevel,
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
    <DashboardLayout title="จองเรียน" navItems={PARENT_NAV_ITEMS} role="parent" userName="ผู้ปกครอง">
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
          <Input label="วันที่เรียน" name="booking_date" type="date" required min={new Date().toISOString().split('T')[0]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="เวลาเริ่ม" name="start_time" type="time" required />
            <Input label="เวลาสิ้นสุด" name="end_time" type="time" required />
          </div>
          <Textarea label="หมายเหตุถึงครู (ถ้ามี)" name="notes" placeholder="เช่น ต้องการเน้นเรื่อง..." />
        </Card>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">ยืนยันการจอง</Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => history.back()}>ยกเลิก</Button>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
