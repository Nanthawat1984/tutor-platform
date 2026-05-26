import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS, type User, type TeacherProfile } from '@/types/firestore';
import { Badge, VerificationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, Clock3, Users, UserCheck, XCircle } from 'lucide-react';
import { getServerAuth } from '@/lib/firebase/server';
import { FieldValue } from 'firebase-admin/firestore';

export default async function AdminTeachersPage() {
  const auth = getServerAuth();
  const db = getServerDb();
  if (!db) return redirect('/login');

  const teachersSnap = await db.collection(COLLECTIONS.USERS)
    .where('role', '==', 'teacher')
    .orderBy('createdAt', 'desc')
    .get();

  const teachers: (User & Partial<TeacherProfile>)[] = [];
  for (const doc of teachersSnap.docs) {
    const userData = { uid: doc.id, ...(doc.data() as any) } as User;
    const teacherSnap = await db.collection(COLLECTIONS.TEACHERS).doc(doc.id).get();
    const teacherData = teacherSnap.exists ? (teacherSnap.data() as Partial<TeacherProfile>) : {};
    teachers.push({ ...userData, ...teacherData });
  }

  const pendingTeachers = teachers.filter((t: any) => !t.isVerified);
  const verifiedTeachers = teachers.filter((t: any) => t.isVerified);

  async function approveTeacher(teacherId: string) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update({
      isVerified: true,
      verificationLevel: 'full',
    });
  }

  async function rejectTeacher(teacherId: string) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update({
      verificationLevel: 'none',
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการครู</h1>
        <p className="text-sm text-gray-500">อนุมัติและจัดการครูพิเศษในระบบ</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 ring-1 ring-blue-100"><Users className="h-5 w-5" /></div>
          <div><p className="text-sm text-gray-500">ครูทั้งหมด</p><p className="text-xl font-bold">{teachers.length}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 ring-1 ring-amber-100"><Clock3 className="h-5 w-5" /></div>
          <div><p className="text-sm text-gray-500">รออนุมัติ</p><p className="text-xl font-bold text-yellow-600">{pendingTeachers.length}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 ring-1 ring-emerald-100"><UserCheck className="h-5 w-5" /></div>
          <div><p className="text-sm text-gray-500">อนุมัติแล้ว</p><p className="text-xl font-bold text-green-600">{verifiedTeachers.length}</p></div>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">รอการอนุมัติ ({pendingTeachers.length})</h2>
        {pendingTeachers.length === 0 ? (
          <Card className="py-8 text-center"><p className="text-gray-500">ไม่มีครูที่รอการอนุมัติ</p></Card>
        ) : (
          <div className="space-y-3">
            {pendingTeachers.map((teacher: any) => (
              <Card key={teacher.uid}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900">{teacher.displayName}</h3>
                      <VerificationBadge level={teacher.verificationLevel} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{teacher.email}</p>
                    <div className="mt-2 flex gap-4 text-xs text-gray-400">
                      <span>ประสบการณ์: {teacher.experienceYears || 0} ปี</span>
                    </div>
                    {teacher.bio && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{teacher.bio}</p>}
                  </div>
                  <div className="flex gap-2">
                    <form action={approveTeacher.bind(null, teacher.uid)}>
                      <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="h-4 w-4" /> อนุมัติ
                      </Button>
                    </form>
                    <form action={rejectTeacher.bind(null, teacher.uid)}>
                      <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-600">
                        <XCircle className="h-4 w-4" /> ปฏิเสธ
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {verifiedTeachers.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">ครูที่อนุมัติแล้ว ({verifiedTeachers.length})</h2>
          <div className="space-y-2">
            {verifiedTeachers.map((teacher: any) => (
              <Card key={teacher.uid} className="opacity-75">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{teacher.displayName}</span>
                      <VerificationBadge level={teacher.verificationLevel} />
                    </div>
                    <p className="text-xs text-gray-500">{teacher.email}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export const dynamic = 'force-dynamic';
