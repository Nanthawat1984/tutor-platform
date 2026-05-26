import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLLECTIONS } from '@/types/firestore';
import { formatTime, getDayName } from '@/lib/utils';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ตารางสอน</h1>
          <p className="text-sm text-gray-500">จัดการตารางเวลาเรียนของคุณ</p>
        </div>
        <Link href="/schedule/new">
          <Button><Plus className="h-4 w-4" /> เพิ่มตารางสอน</Button>
        </Link>
      </div>

      {schedules.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <CalendarDays className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">ยังไม่มีตารางสอน</h3>
          <Link href="/schedule/new" className="mt-4 inline-block">
            <Button><Plus className="h-4 w-4" /> เพิ่มตารางสอน</Button>
          </Link>
        </Card>
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
                    <div key={s.id} className="rounded-lg border bg-blue-50/70 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{s.courseTitle}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
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
    </div>
  );
}


export const dynamic = 'force-dynamic';
