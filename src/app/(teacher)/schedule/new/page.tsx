import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';

const dayOptions = [
  { value: '0', label: 'อาทิตย์' },
  { value: '1', label: 'จันทร์' },
  { value: '2', label: 'อังคาร' },
  { value: '3', label: 'พุธ' },
  { value: '4', label: 'พฤหัสบดี' },
  { value: '5', label: 'ศุกร์' },
  { value: '6', label: 'เสาร์' },
];

const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const minute = (i % 2) * 30;
  if (hour >= 24) return null;
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return { value: `${h}:${m}:00`, label: `${h}:${m} น.` };
}).filter(Boolean) as { value: string; label: string }[];

export default async function NewSchedulePage() {
  const session = await requireSessionUser();
  const teacherId = session.uid;

  // โหลดคอร์สที่เปิดสอนของครู (active เท่านั้น)
  const db = getServerDb();
  const coursesSnap = db
    ? await db.collection(COLLECTIONS.COURSES)
        .where('teacherId', '==', teacherId)
        .where('isActive', '==', true)
        .get()
    : null;
  const courseOptions =
    coursesSnap && !coursesSnap.empty
      ? [
          { value: '', label: '-- เลือกคอร์ส --' },
          ...coursesSnap.docs.map((doc) => ({
            value: doc.id,
            label: doc.data()?.title || 'คอร์สเรียน',
          })),
        ]
      : [{ value: '', label: '-- ยังไม่มีคอร์ส (สร้างคอร์สก่อน) --' }];

  async function addScheduleAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;

    const courseId = formData.get('course_id') as string;
    if (!courseId) return;

    // ตรวจว่าคอร์สเป็นของครูคนนี้จริง + ดึงชื่อคอร์สที่ถูกต้อง
    const courseSnap = await dbRef.collection(COLLECTIONS.COURSES).doc(courseId).get();
    if (!courseSnap.exists || courseSnap.data()?.teacherId !== teacherId) {
      redirect('/schedule/new');
      return;
    }

    await dbRef.collection(COLLECTIONS.SCHEDULES).add({
      teacherId,
      courseId,
      courseTitle: courseSnap.data()?.title || 'คอร์สเรียน',
      dayOfWeek: parseInt(formData.get('day_of_week') as string),
      startTime: formData.get('start_time') as string,
      endTime: formData.get('end_time') as string,
      startDate: formData.get('start_date') as string,
      endDate: formData.get('end_date') as string || null,
      isRecurring: formData.get('is_recurring') === 'true',
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/schedule');
  }

  return (
    <DashboardLayout
      title="เพิ่มตารางสอน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">กำหนดวันและเวลาที่คุณพร้อมสอน</p>

      <form action={addScheduleAction} className="space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <Select label="คอร์สเรียน" name="course_id" options={courseOptions} required />
          <Select label="วันในสัปดาห์" name="day_of_week" options={dayOptions} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="เวลาเริ่ม" name="start_time" options={[{ value: '', label: '-- เลือก --' }, ...timeOptions]} required />
            <Select label="เวลาสิ้นสุด" name="end_time" options={[{ value: '', label: '-- เลือก --' }, ...timeOptions]} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="วันที่เริ่ม" name="start_date" type="date" required />
            <Input label="วันที่สิ้นสุด (ไม่ระบุ = ไม่มีกำหนด)" name="end_date" type="date" />
          </div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="is_recurring" value="true" defaultChecked className="h-4 w-4 rounded accent-pink-600" />
            เป็นตารางซ้ำทุกสัปดาห์
          </label>
        </div>
        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">บันทึกตารางสอน</Button>
          <Link href="/schedule" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
