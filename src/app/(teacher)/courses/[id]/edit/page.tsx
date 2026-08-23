import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect, notFound } from 'next/navigation';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';

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

// Fallback เมื่อยังไม่มีข้อมูลวิชาใน Firestore
const FALLBACK_SUBJECTS = [
  'คณิตศาสตร์', 'วิทยาศาสตร์', 'ภาษาอังกฤษ', 'ภาษาไทย', 'สังคมศึกษา',
  'ฟิสิกส์', 'เคมี', 'ชีววิทยา', 'ภาษาจีน', 'ภาษาญี่ปุ่น',
  'คอมพิวเตอร์', 'ดนตรี', 'ศิลปะ',
];

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id } = await params;

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(id).get();
  if (!courseSnap.exists) notFound();

  const course = { id: courseSnap.id, ...courseSnap.data() } as any;

  // ตรวจสิทธิ์: เฉพาะเจ้าของคอร์สเท่านั้น
  if (course.teacherId !== session.uid) {
    return redirect(`/courses/${id}`);
  }

  // โหลดสถานที่สอนของครู
  const centersSnap = await db.collection(COLLECTIONS.CENTERS).where('teacherId', '==', session.uid).get();
  const centers = centersSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // โหลดรายวิชา (ถ้าว่างใช้ fallback)
  const subjectsSnap = await db.collection(COLLECTIONS.SUBJECTS).orderBy('order', 'asc').get();
  const subjectOptions = !subjectsSnap.empty
    ? subjectsSnap.docs.map((doc: any) => ({
        value: doc.id,
        label: doc.data()?.name || doc.id,
      }))
    : FALLBACK_SUBJECTS.map((name) => ({ value: name, label: name }));

  async function updateCourseAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== session.uid) return;

    // ตรวจสิทธิ์อีกครั้งฝั่ง server action
    const ref = dbRef.collection(COLLECTIONS.COURSES).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.teacherId !== session.uid) {
      redirect(`/courses/${id}`);
      return;
    }

    const centerId = (formData.get('center_id') as string) || '';
    let centerName = '';
    if (centerId) {
      const centerSnap = await dbRef.collection(COLLECTIONS.CENTERS).doc(centerId).get();
      if (centerSnap.exists) centerName = centerSnap.data()?.name || '';
    }

    // Resolve ชื่อวิชาจาก id (fallback: ใช้ค่าที่ส่งมาเป็นชื่อตรงๆ)
    const subjectId = (formData.get('subject_id') as string) || '';
    let subjectName = subjectId;
    if (subjectId) {
      const subjectSnap = await dbRef.collection(COLLECTIONS.SUBJECTS).doc(subjectId).get();
      if (subjectSnap.exists) subjectName = subjectSnap.data()?.name || subjectId;
    }

    await ref.update({
      subjectId,
      subjectName: subjectName || 'ทั่วไป',
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      level: formData.get('level') as string,
      format: formData.get('format') as any,
      maxStudents: parseInt(formData.get('max_students') as string) || 1,
      pricePerSession: parseFloat(formData.get('price_per_session') as string) || 0,
      durationMinutes: parseInt(formData.get('duration_minutes') as string) || 60,
      centerId: centerId || null,
      centerName: centerName || null,
      isActive: formData.get('is_active') === 'on',
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect(`/courses/${id}`);
  }

  return (
    <DashboardLayout
      title="แก้ไขคอร์สเรียน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <Link href={`/courses/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-pink-700">
        ← กลับไปรายละเอียดคอร์ส
      </Link>

      <form action={updateCourseAction} className="space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">ข้อมูลคอร์ส</h2>

          <Input label="ชื่อคอร์ส" name="title" required defaultValue={course.title || ''} placeholder="เช่น คณิตศาสตร์ ป.6 เตรียมสอบ O-NET" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="วิชา"
              name="subject_id"
              options={[{ value: '', label: '-- เลือกวิชา --' }, ...subjectOptions]}
              defaultValue={course.subjectId || ''}
              required
            />
            <Select label="ระดับชั้น" name="level" options={levelOptions} defaultValue={course.level || ''} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="รูปแบบการสอน" name="format" options={formatOptions} defaultValue={course.format || ''} required />
            <Input label="จำนวนนักเรียนสูงสุด" name="max_students" type="number" defaultValue={String(course.maxStudents ?? 1)} min="1" max="50" />
          </div>

          <Select
            label="สถานที่สอน"
            name="center_id"
            options={[
              { value: '', label: '-- ไม่ระบุ / สอนออนไลน์ --' },
              ...centers.map((c: any) => ({
                value: c.id,
                label: c.name || [c.address, c.subdistrict, c.district, c.province].filter(Boolean).join(' '),
              })),
            ]}
            defaultValue={course.centerId || ''}
            helperText="เลือกสถานที่ที่เปิดสอน — ผู้ปกครองจะเห็นคอร์สนี้บนแผนที่"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ราคาต่อเซสชัน (บาท)" name="price_per_session" type="number" required min="0" step="50" defaultValue={String(course.pricePerSession ?? '')} />
            <Input label="ระยะเวลา (นาที)" name="duration_minutes" type="number" defaultValue={String(course.durationMinutes ?? 60)} min="15" step="15" />
          </div>

          <Textarea label="รายละเอียดคอร์ส" name="description" defaultValue={course.description || ''} placeholder="อธิบายเนื้อหาที่จะสอน วิธีการสอน ฯลฯ" />

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={course.isActive !== false}
              className="h-5 w-5 rounded border-slate-300 text-pink-600 focus:ring-pink-200"
            />
            <span className="text-sm font-medium text-slate-700">เปิดรับนักเรียน (แสดงในหน้าค้นหา)</span>
          </label>
        </div>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">บันทึกการแก้ไข</Button>
          <Link href={`/courses/${id}`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
