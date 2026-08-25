import Link from 'next/link';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { GraduationCap, Pencil, Plus, Users } from 'lucide-react';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import DeleteSubmitButton from '@/components/teacher/delete-submit-button';
import { StudentPhotoUploader } from '@/components/parent/student-photo-uploader';
import { isValidStudentPhotoPath } from '@/lib/students/student-photo';

export default async function MyStudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;
  const params = searchParams ? await searchParams : {};

  const studentsSnap = await db.collection(COLLECTIONS.STUDENTS)
    .where('parentId', '==', parentId)
    .get();
  // Keep this query usable even when the production composite index has not
  // been deployed yet; sort the small parent-owned result set in memory.
  const students = [...studentsSnap.docs]
    .sort((a: any, b: any) => {
      const aCreatedAt = a.data().createdAt?.toMillis?.() || 0;
      const bCreatedAt = b.data().createdAt?.toMillis?.() || 0;
      return aCreatedAt - bCreatedAt;
    })
    .map((doc: any) => ({ id: doc.id, ...doc.data() }));

  async function addStudent(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['parent'])).session;
    if (current.uid !== parentId) return;

    await dbRef.collection(COLLECTIONS.STUDENTS).add({
      parentId,
      name: formData.get('name') as string,
      level: formData.get('level') as string || null,
      school: formData.get('school') as string || null,
      notes: formData.get('notes') as string || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/my-students');
  }

  async function updateStudentAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['parent'])).session;
    if (current.uid !== parentId) return;
    const id = formData.get('id') as string;
    const studentRef = dbRef.collection(COLLECTIONS.STUDENTS).doc(id);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists || studentSnap.data()?.parentId !== current.uid) return;

    const studentData = studentSnap.data() || {};
    const previousPhotoPath = typeof studentData.photoPath === 'string' ? studentData.photoPath : '';
    const rawPhotoPath = formData.get('photo_path');
    if (rawPhotoPath !== null && typeof rawPhotoPath !== 'string') {
      redirect('/my-students?error=student-photo');
    }
    // Preserve an existing photo when an older client submits the form
    // without the new optional field.
    const photoPath = rawPhotoPath === null ? previousPhotoPath : rawPhotoPath.trim();
    if (photoPath && !isValidStudentPhotoPath(photoPath, id)) {
      redirect('/my-students?error=student-photo');
    }

    await studentRef.update({
      name: formData.get('name') as string,
      level: formData.get('level') as string || null,
      school: formData.get('school') as string || null,
      notes: formData.get('notes') as string || null,
      photoPath: photoPath || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (previousPhotoPath && previousPhotoPath !== photoPath && isValidStudentPhotoPath(previousPhotoPath, id)) {
      const storage = getServerStorage();
      if (storage) {
        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
          || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
        await storage.bucket(bucketName).file(previousPhotoPath).delete().catch(() => undefined);
      }
    }

    redirect('/my-students');
  }

  async function deleteStudentAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['parent'])).session;
    if (current.uid !== parentId) return;
    const id = formData.get('id') as string;
    const studentRef = dbRef.collection(COLLECTIONS.STUDENTS).doc(id);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists || studentSnap.data()?.parentId !== current.uid) return;

    const studentData = studentSnap.data() || {};
    const photoPath = typeof studentData.photoPath === 'string' ? studentData.photoPath : '';

    await studentRef.delete();
    if (photoPath && isValidStudentPhotoPath(photoPath, id)) {
      const storage = getServerStorage();
      if (storage) {
        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
          || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
        await storage.bucket(bucketName).file(photoPath).delete().catch(() => undefined);
      }
    }
    redirect('/my-students');
  }

  return (
    <DashboardLayout
      title="นักเรียนของฉัน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">
        เพิ่มรายชื่อลูกของคุณ เพื่อให้การจองเรียนเร็วขึ้น — เลือกได้จากหน้าจองเรียน
      </p>
      {params.error === 'student-photo' && (
        <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ไม่สามารถบันทึกรูปนักเรียนได้ กรุณาเลือกรูปใหม่แล้วลองอีกครั้ง
        </p>
      )}

      {/* ── Add Student Form ── */}
      <Card className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
            <Plus className="h-4 w-4" />
          </span>
          เพิ่มนักเรียนใหม่
        </h2>

        <form action={addStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="ชื่อ-นามสกุล *" name="name" required placeholder="ชื่อลูกของคุณ" />
          <Input label="ระดับชั้น" name="level" placeholder="เช่น ป.4, ม.2" />
          <Input label="โรงเรียน (ไม่บังคับ)" name="school" placeholder="ชื่อโรงเรียน" />
          <Textarea label="หมายเหตุ (ไม่บังคับ)" name="notes" placeholder="เช่น แพ้ถั่ว, เน้นคณิตศาสตร์" />
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4" />
              เพิ่มนักเรียน
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Student List ── */}
      {students.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="ยังไม่มีรายชื่อนักเรียน"
          description="เพิ่มรายชื่อลูกของคุณด้านบน เพื่อใช้ตอนจองเรียน"
        />
      ) : (
        <div className="space-y-3">
          {students.map((student: any) => (
            <Card key={student.id} className="overflow-hidden">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 font-bold text-pink-700">
                    {student.photoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/students/${encodeURIComponent(student.id)}/photo`}
                        alt={`รูปของนักเรียน ${student.name}`}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <GraduationCap className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="text-sm text-slate-500">
                      {student.level || 'ไม่ระบุระดับ'} {student.school ? `• ${student.school}` : ''}
                    </p>
                    {student.notes && (
                      <p className="mt-1 text-xs text-slate-400">{student.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-2 md:ml-auto md:items-end">
                  <details className="group w-full md:w-96">
                    <summary className="inline-flex min-h-[40px] w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-white/70 px-3.5 py-2 text-sm font-bold text-pink-700 transition-colors hover:bg-pink-50 md:w-auto">
                      <Pencil className="h-4 w-4" />
                      แก้ไข
                    </summary>
                    <div className="mt-2 w-full rounded-2xl border border-pink-100 bg-white p-4 shadow-elevated">
                      <form action={updateStudentAction} className="space-y-3">
                        <input type="hidden" name="id" value={student.id} />
                        <Input name="name" defaultValue={student.name} required placeholder="ชื่อ-นามสกุล" />
                        <Input name="level" defaultValue={student.level || ''} placeholder="ระดับชั้น" />
                        <Input name="school" defaultValue={student.school || ''} placeholder="โรงเรียน" />
                        <Textarea name="notes" defaultValue={student.notes || ''} placeholder="หมายเหตุ" />
                        <StudentPhotoUploader
                          parentId={parentId}
                          studentId={student.id}
                          initialPath={student.photoPath}
                        />
                        <Button type="submit" size="sm" className="w-full">บันทึก</Button>
                      </form>
                    </div>
                  </details>

                  <form action={deleteStudentAction}>
                    <input type="hidden" name="id" value={student.id} />
                    <DeleteSubmitButton label={`ลบรายชื่อ ${student.name}`} />
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/explore"
          className="text-sm font-semibold text-pink-600 hover:underline"
        >
          ← กลับไปค้นหาครู
        </Link>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
