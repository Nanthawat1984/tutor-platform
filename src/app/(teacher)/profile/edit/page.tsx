import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { GraduationCap, Video, Sparkles, FileText } from 'lucide-react';
import { ProfilePhotoUploader } from '@/components/teacher/profile-photo-uploader';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { LineLinkCard } from '@/components/line/line-link-card';

const TEACHING_STYLE_OPTIONS = [
  { value: 'fun', label: 'เน้นสนุก', desc: 'เรียนสนุก ไม่เครียด' },
  { value: 'exam_focused', label: 'เน้นข้อสอบ', desc: 'เน้นแนวข้อสอบ/คะแนน' },
  { value: 'concept_based', label: 'เน้นความเข้าใจ', desc: 'ปูพื้นฐาน เข้าใจแก่นแท้' },
];

export default async function EditProfilePage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  const teacherSnap = await db.collection(COLLECTIONS.TEACHERS).doc(teacherId).get();
  const teacher = teacherSnap.exists ? { id: teacherSnap.id, ...teacherSnap.data() } as any : null;

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  const user = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } as any : null;

  const teachingStyles: string[] = teacher?.teachingStyle ?? [];

  async function updateProfileAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;

    const teachingStyle = formData.getAll('teaching_style').map(String);
    const experienceYears = parseInt(formData.get('experience_years') as string) || 0;

    await dbRef.collection(COLLECTIONS.TEACHERS).doc(teacherId).set({
      uid: teacherId,
      bio: formData.get('bio') as string || null,
      education: formData.get('education') as string || null,
      videoIntroURL: formData.get('video_intro_url') as string || null,
      experienceYears,
      teachingStyle,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const displayName = (formData.get('display_name') as string || '').trim();
    const photoUrl = (formData.get('photo_url') as string || '').trim();
    const taxId = (formData.get('tax_id') as string || '').replace(/\D/g, '');
    const taxAddress = (formData.get('tax_address') as string || '').trim();

    if (taxId && taxId.length !== 13) {
      redirect('/profile/edit?error=taxid');
    }

    const userUpdates: Record<string, unknown> = {
      // photo_url สะท้อนสถานะปัจจุบันเสมอ (อัปโหลดใหม่ = URL, ลบรูป = ว่าง → ลบ photoURL)
      photoURL: photoUrl || null,
      taxId: taxId || null,          // เลขประจำตัวผู้เสียภาษี (13 หลัก) — ใช้ทำ 50 ทวิ
      taxAddress: taxAddress || null, // ที่อยู่ตามบัตร — ใช้พิมพ์บน 50 ทวิ
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (displayName) userUpdates.displayName = displayName;

    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update(userUpdates);

    redirect('/dashboard?profile=updated');
  }

  return (
    <DashboardLayout
      title="แก้ไขโปรไฟล์"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">
        ข้อมูลนี้จะแสดงบนโปรไฟล์สาธารณะของคุณ ({`/teachers/${teacherId}`})
      </p>

      <div className="mb-6">
        <LineLinkCard
          initialLinked={Boolean(user?.lineUserId)}
          initialEnabled={user?.lineNotificationEnabled !== false}
          handoffPath="/profile/edit"
        />
      </div>

      <form action={updateProfileAction} className="space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
              <GraduationCap className="h-4 w-4" />
            </span>
            ข้อมูลทั่วไป
          </h2>

          <ProfilePhotoUploader userId={teacherId} currentPhotoURL={user?.photoURL} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="ชื่อ-นามสกุล"
              name="display_name"
              defaultValue={user?.displayName || ''}
              placeholder="ชื่อ นามสกุล"
            />
            <Input
              label="ประสบการณ์สอน (ปี)"
              name="experience_years"
              type="number"
              min="0"
              max="60"
              defaultValue={teacher?.experienceYears ?? 0}
            />
          </div>

          <Input
            label="การศึกษา"
            name="education"
            defaultValue={teacher?.education || ''}
            placeholder="เช่น คณะวิศวกรรมศาสตร์ จุฬาฯ"
          />

          <Textarea
            label="แนะนำตัวเอง (bio)"
            name="bio"
            defaultValue={teacher?.bio || ''}
            placeholder="เล่าถึงตัวคุณ ประสบการณ์สอน วิชาที่ถนัด ฯลฯ"
            helperText="จะแสดงบนโปรไฟล์สาธารณะของคุณ"
          />

          <Input
            label="ลิงก์วิดีโอแนะนำตัว (YouTube)"
            name="video_intro_url"
            type="url"
            defaultValue={teacher?.videoIntroURL || ''}
            placeholder="https://youtube.com/..."
            leftIcon={<Video className="h-4 w-4" />}
          />
        </div>

        <div className="form-card p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
              <Sparkles className="h-4 w-4" />
            </span>
            รูปแบบการสอน
          </h2>
          <p className="text-sm text-slate-500">เลือกได้มากกว่า 1 แบบ</p>

          <div className="grid gap-3 sm:grid-cols-3">
            {TEACHING_STYLE_OPTIONS.map((style) => (
              <label
                key={style.value}
                className="relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 border-pink-100 bg-white/70 p-4 transition-all has-[:checked]:border-pink-500 has-[:checked]:bg-pink-50 hover:border-pink-300"
              >
                <input
                  type="checkbox"
                  name="teaching_style"
                  value={style.value}
                  defaultChecked={teachingStyles.includes(style.value)}
                  className="sr-only"
                />
                <p className="font-bold text-slate-800">{style.label}</p>
                <p className="text-xs text-slate-500">{style.desc}</p>
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-pink-200 bg-white transition-all [label:has(:checked)_&]:border-pink-500">
                  <div className="h-2.5 w-2.5 rounded-full bg-pink-500 opacity-0 [label:has(:checked)_&]:opacity-100" />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="form-card p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <FileText className="h-4 w-4" />
            </span>
            ข้อมูลสำหรับออกเอกสารภาษี (50 ทวิ)
          </h2>
          <p className="text-sm text-slate-500">
            ใช้พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — ไม่แสดงบนโปรไฟล์สาธารณะ
          </p>
          <Input
            label="เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน (13 หลัก)"
            name="tax_id"
            defaultValue={user?.taxId || ''}
            placeholder="X XXXX XXXXX XX X"
            inputMode="numeric"
            maxLength={17}
          />
          <Textarea
            label="ที่อยู่ตามบัตรประชาชน"
            name="tax_address"
            defaultValue={user?.taxAddress || ''}
            placeholder="บ้านเลขที่ หมู่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
            rows={3}
          />
        </div>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">บันทึกโปรไฟล์</Button>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
