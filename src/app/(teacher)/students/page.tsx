import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, School, StickyNote, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate } from '@/lib/utils';

export default async function StudentsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', teacherId)
    .where('status', 'in', ['confirmed', 'completed'])
    .orderBy('studentName')
    .get();

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // Group by student, keep latest booking per student
  const byStudent: Record<string, any> = {};
  bookings.forEach((b: any) => {
    const key = b.studentId || b.studentName || 'ไม่ระบุ';
    if (!byStudent[key] || String(b.bookingDate) > String(byStudent[key].bookingDate)) {
      byStudent[key] = b;
    }
  });

  // Batch-fetch student docs (students/{id}) for level / notes / school
  const studentRefs = Object.values(byStudent)
    .filter((b: any) => b.studentId)
    .map((b: any) => db.collection(COLLECTIONS.STUDENTS).doc(b.studentId));
  const studentSnaps = studentRefs.length ? await db.getAll(...studentRefs) : [];
  const studentMap = new Map(
    studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );

  const students = Object.entries(byStudent).map(([key, booking]: [string, any]) => {
    const studentDoc = booking.studentId ? studentMap.get(booking.studentId) as any : null;
    return {
      id: booking.studentId || key,
      name: studentDoc?.name || booking.studentName || 'ไม่ระบุ',
      level: studentDoc?.level || booking.studentLevel || null,
      school: studentDoc?.school || null,
      notes: studentDoc?.notes || null,
      courseTitle: booking.courseTitle,
      lastSession: booking.bookingDate,
    };
  });

  return (
    <DashboardLayout
      title="นักเรียน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName="คุณครู"
    >
      {students.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="ยังไม่มีนักเรียน"
          description="นักเรียนที่จองเรียนกับคุณจะแสดงที่นี่"
          action={{ label: 'ดูตารางสอน', href: '/schedule' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => (
            <Card key={student.id} hoverable className="flex flex-col">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 font-bold text-pink-700">
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">{student.name}</h3>
                  <p className="mt-0.5 truncate text-sm text-gray-500">{student.courseTitle}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {student.level && <Badge variant="outline">{student.level}</Badge>}
                    {student.lastSession && (
                      <span className="text-xs text-gray-400">
                        ล่าสุด: {formatDate(student.lastSession, 'd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Student profile details */}
              {(student.level || student.school || student.notes) && (
                <div className="mt-4 space-y-2 border-t border-pink-100/60 pt-4 text-sm">
                  {student.school && (
                    <p className="flex items-center gap-2 text-slate-600">
                      <School className="h-4 w-4 shrink-0 text-pink-400" />
                      <span className="truncate">{student.school}</span>
                    </p>
                  )}
                  {student.notes && (
                    <p className="flex items-start gap-2 text-slate-500">
                      <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />
                      <span className="leading-relaxed">{student.notes}</span>
                    </p>
                  )}
                </div>
              )}

              {!student.level && !student.school && !student.notes && (
                <p className="mt-4 flex items-center gap-2 border-t border-pink-100/60 pt-4 text-xs text-slate-400">
                  <GraduationCap className="h-3.5 w-3.5" />
                  ไม่มีข้อมูลเพิ่มเติมจากผู้ปกครอง
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
