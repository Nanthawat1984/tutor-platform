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

export default async function NewCoursePage() {
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const teacherName = session.displayName || 'คุณครู';

  // โหลดรายวิชาจาก subjects collection (ถ้าว่างใช้ fallback)
  const db = getServerDb();
  const centersSnap = db
    ? await db.collection(COLLECTIONS.CENTERS).where('teacherId', '==', teacherId).get()
    : null;
  const centers = centersSnap
    ? centersSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
    : [];

  const subjectsSnap = db
    ? await db.collection(COLLECTIONS.SUBJECTS).orderBy('order', 'asc').get()
    : null;
  const subjectOptions = subjectsSnap && !subjectsSnap.empty
    ? [
        { value: '', label: '-- เลือกวิชา --' },
        ...subjectsSnap.docs.map((doc: any) => ({
          value: doc.id,
          label: doc.data()?.name || doc.id,
        })),
      ]
    : [
        { value: '', label: '-- เลือกวิชา --' },
        ...FALLBACK_SUBJECTS.map((name) => ({ value: name, label: name })),
      ];

  async function createCourseAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;

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

    await dbRef.collection(COLLECTIONS.COURSES).add({
      teacherId,
      teacherName,
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
      // คลาสทดลอง (เฟส 3) — ราคาพิเศษครั้งเดียวต่อผู้ปกครอง 1 คนต่อครู 1 คน
      trialEnabled: formData.get('trial_enabled') === 'on',
      trialPrice: Math.max(0, Math.round(parseFloat(formData.get('trial_price') as string) || 0)),
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
            <Select label="วิชา" name="subject_id" options={subjectOptions} required />
            <Select label="ระดับชั้น" name="level" options={levelOptions} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="รูปแบบการสอน" name="format" options={formatOptions} required />
            <Input label="จำนวนนักเรียนสูงสุด" name="max_students" type="number" defaultValue="1" min="1" max="50" />
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
            helperText="เลือกสถานที่ที่เปิดสอน — ผู้ปกครองจะเห็นคอร์สนี้บนแผนที่"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ราคาต่อเซสชัน (บาท)" name="price_per_session" type="number" required min="0" step="50" placeholder="500" />
            <Input label="ระยะเวลา (นาที)" name="duration_minutes" type="number" defaultValue="60" min="15" step="15" />
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="trial_enabled" className="mt-1 h-5 w-5 rounded border-slate-300 text-violet-600" />
              <span>
                <span className="text-sm font-bold text-slate-800">เปิดคลาสทดลองราคาพิเศษ</span>
                <span className="mt-0.5 block text-xs text-slate-500">ดึงดูดผู้ปกครองใหม่ให้ลองครั้งเดียวในราคาถูก ระบบกันใช้ซ้ำอัตโนมัติ</span>
              </span>
            </label>
            <div className="mt-3">
              <Input label="ราคาทดลอง (บาท)" name="trial_price" type="number" min="0" step="50" placeholder="199" helperText="ว่างไว้หรือใส่ 0 = ไม่เปิดทดลอง" />
            </div>
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
