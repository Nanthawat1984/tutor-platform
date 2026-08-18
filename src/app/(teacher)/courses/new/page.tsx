import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';

const levelOptions = [
  { value: '', label: '-- เลือกระดับ --' },
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ป.${i + 1}`, label: `ป.${i + 1}` })),
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ม.${i + 1}`, label: `ม.${i + 1}` })),
  { value: 'TGAT', label: 'TGAT' },
  { value: 'A-Level', label: 'A-Level' },
  { value: 'GED', label: 'GED' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

const formatOptions = [
  { value: '', label: '-- เลือกรูปแบบ --' },
  { value: 'one_on_one', label: '1-on-1 (ตัวต่อตัว)' },
  { value: 'small_group', label: 'กลุ่มเล็ก (2-10 คน)' },
  { value: 'online', label: 'ออนไลน์' },
  { value: 'hybrid', label: 'ผสม (Online + On-site)' },
];

export default async function NewCoursePage() {
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const teacherName = session.displayName || 'คุณครู';

  async function createCourseAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    await dbRef.collection(COLLECTIONS.COURSES).add({
      teacherId,
      teacherName,
      subjectId: formData.get('subject_id') as string,
      subjectName: formData.get('subject_id') as string || 'ทั่วไป',
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      level: formData.get('level') as string,
      format: formData.get('format') as any,
      maxStudents: parseInt(formData.get('max_students') as string) || 1,
      pricePerSession: parseFloat(formData.get('price_per_session') as string) || 0,
      durationMinutes: parseInt(formData.get('duration_minutes') as string) || 60,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/courses');
  }

  return (
    <DashboardLayout
      title="สร้างคอร์สเรียนใหม่"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">กรอกข้อมูลคอร์สเรียนที่คุณต้องการเปิดสอน</p>

      <form action={createCourseAction} className="space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">ข้อมูลคอร์ส</h2>

          <Input label="ชื่อคอร์ส" name="title" required placeholder="เช่น คณิตศาสตร์ ป.6 เตรียมสอบ O-NET" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="วิชา" name="subject_id" options={[{ value: '', label: '-- เลือกวิชา --' }]} required />
            <Select label="ระดับชั้น" name="level" options={levelOptions} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="รูปแบบการสอน" name="format" options={formatOptions} required />
            <Input label="จำนวนนักเรียนสูงสุด" name="max_students" type="number" defaultValue="1" min="1" max="50" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ราคาต่อเซสชัน (บาท)" name="price_per_session" type="number" required min="0" step="50" placeholder="500" />
            <Input label="ระยะเวลา (นาที)" name="duration_minutes" type="number" defaultValue="60" min="15" step="15" />
          </div>

          <Textarea label="รายละเอียดคอร์ส" name="description" placeholder="อธิบายเนื้อหาที่จะสอน วิธีการสอน ฯลฯ" />
        </div>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">สร้างคอร์ส</Button>
          <Link href="/courses" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
