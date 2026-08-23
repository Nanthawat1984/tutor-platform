import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatTime } from '@/lib/utils';
import type { Schedule } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import DeleteSubmitButton from '@/components/teacher/delete-submit-button';

const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default async function SchedulePage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  // Get teacher's courses first
  const coursesSnap = await db.collection(COLLECTIONS.COURSES)
    .where('teacherId', '==', teacherId)
    .where('isActive', '==', true)
    .get();

  const courseIds = coursesSnap.docs.map((d) => d.id);

  // ดึงเฉพาะตารางของคอร์สของครูคนนี้ (in-query ฟิลด์เดียว ไม่ต้องใช้ composite index)
  const schedulesSnap = courseIds.length
    ? await db.collection(COLLECTIONS.SCHEDULES)
        .where('courseId', 'in', courseIds)
        .get()
    : null;

  const schedules = (schedulesSnap?.docs ?? [])
    .map((doc: any) => ({ id: doc.id, ...doc.data() } as Schedule))
    .filter((s: any) => s.isActive !== false)
    .sort(
      (a: any, b: any) =>
        a.dayOfWeek - b.dayOfWeek ||
        String(a.startTime || '').localeCompare(String(b.startTime || ''))
    );

  const byDay: Record<number, Schedule[]> = {};
  schedules.forEach((s) => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = [];
    byDay[s.dayOfWeek].push(s);
  });

  async function deleteScheduleAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;
    const scheduleId = formData.get('schedule_id') as string;
    if (!scheduleId) return;

    const snap = await dbRef.collection(COLLECTIONS.SCHEDULES).doc(scheduleId).get();
    if (!snap.exists) {
      redirect('/schedule');
      return;
    }
    const data = snap.data() as any;
    // ตรวจสิทธิ์: เป็นตารางของครูคนนี้ หรืออยู่ในคอร์สของครูคนนี้
    const ownsDirectly = data?.teacherId === teacherId;
    const ownsViaCourse =
      typeof data?.courseId === 'string' && courseIds.includes(data.courseId);
    if (ownsDirectly || ownsViaCourse) {
      await dbRef.collection(COLLECTIONS.SCHEDULES).doc(scheduleId).delete();
    }
    redirect('/schedule');
  }

  return (
    <DashboardLayout
      title="ตารางสอน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="responsive-page-header mb-6">
        <p className="text-sm text-slate-500">จัดการตารางเวลาเรียนของคุณ</p>
        <Link href="/schedule/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto"><Plus className="h-4 w-4" /> เพิ่มตารางสอน</Button>
        </Link>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title="ยังไม่มีตารางสอน"
          description="เพิ่มวันและเวลาที่คุณพร้อมสอน"
          action={{ label: 'เพิ่มตารางสอน', href: '/schedule/new' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dayNames.map((dayName, dayIndex) => {
            const daySchedules = byDay[dayIndex] || [];
            if (daySchedules.length === 0) return null;
            return (
              <Card key={dayIndex}>
                <h3 className="mb-3 font-semibold text-gray-900">{dayName}</h3>
                <div className="space-y-2">
                  {daySchedules.map((s) => (
                    <div key={s.id} className="rounded-lg border border-pink-100/70 bg-pink-50/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate font-medium text-sm">{s.courseTitle}</p>
                        <form action={deleteScheduleAction} className="shrink-0">
                          <input type="hidden" name="schedule_id" value={s.id} />
                          <DeleteSubmitButton label="ลบตารางนี้" />
                        </form>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Clock className="h-3 w-3" />
                          {formatTime(s.startTime)} - {formatTime(s.endTime)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
