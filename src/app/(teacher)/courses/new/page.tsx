import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

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

export default function NewCoursePage() {
  const db = getServerDb();
  const teacherId = 'temp-teacher-id'; // TODO: from session

  async function createCourseAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    await dbRef.collection(COLLECTIONS.COURSES).add({
      teacherId,
      teacherName: 'Teacher Name', // TODO: from session
      subjectId: formData.get('subject_id') as string,
      subjectName: 'Subject', // TODO: lookup
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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">สร้างคอร์สเรียนใหม่</h1>
      <p className="mt-1 text-sm text-gray-500">กรอกข้อมูลคอร์สเรียนที่คุณต้องการเปิดสอน</p>

      <form action={createCourseAction} className="mt-8 space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">ข้อมูลคอร์ส</h2>

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

        <div className="flex gap-3">
          <Button type="submit">สร้างคอร์ส</Button>
          <Link href="/courses">
            <Button type="button" variant="outline">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}


export const dynamic = 'force-dynamic';
