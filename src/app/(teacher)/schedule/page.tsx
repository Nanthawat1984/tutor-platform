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

const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default async function SchedulePage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';

  // Get teacher's courses first
  const coursesSnap = await db.collection(COLLECTIONS.COURSES)
    .where('teacherId', '==', teacherId)
    .where('isActive', '==', true)
    .get();

  const courseIds = coursesSnap.docs.map((d) => d.id);

  const schedulesSnap = await db.collection(COLLECTIONS.SCHEDULES)
    .where('isActive', '==', true)
    .orderBy('dayOfWeek')
    .orderBy('startTime')
    .get();

  const schedules = schedulesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Schedule));

  const byDay: Record<number, Schedule[]> = {};
  schedules.forEach((s) => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = [];
    byDay[s.dayOfWeek].push(s);
  });

  return (
    <DashboardLayout
      title="ตารางสอน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName="คุณครู"
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
                    <div key={s.id} className="rounded-lg border border-violet-100/70 bg-violet-50/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-sm">{s.courseTitle}</p>
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
