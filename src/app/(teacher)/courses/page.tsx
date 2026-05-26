import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Plus, Edit2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { COLLECTIONS } from '@/types/firestore';
import type { Course } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const formatLabels: Record<string, string> = {
  one_on_one: '1-on-1',
  small_group: 'กลุ่มเล็ก',
  online: 'ออนไลน์',
  hybrid: 'ผสม',
};

export default async function CoursesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';

  const coursesSnap = await db.collection(COLLECTIONS.COURSES)
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .get();

  const courses = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">คอร์สเรียน</h1>
          <p className="text-sm text-gray-500">จัดการคอร์สเรียนที่คุณเปิดสอน</p>
        </div>
        <Link href="/courses/new">
          <Button><Plus className="h-4 w-4" /> สร้างคอร์สใหม่</Button>
        </Link>
      </div>

      {courses.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <BookOpen className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">ยังไม่มีคอร์สเรียน</h3>
          <p className="mt-2 text-sm text-gray-500">เริ่มสร้างคอร์สแรกของคุณ</p>
          <Link href="/courses/new" className="mt-4 inline-block">
            <Button><Plus className="h-4 w-4" /> สร้างคอร์สใหม่</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => (
            <Card key={course.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{course.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {course.subjectName} • ระดับ {course.level}
                  </p>
                </div>
                <Badge variant={course.isActive ? 'success' : 'default'}>
                  {course.isActive ? 'เปิด' : 'ปิด'}
                </Badge>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>รูปแบบ</span>
                  <span className="font-medium">{formatLabels[course.format] || course.format}</span>
                </div>
                <div className="flex justify-between">
                  <span>ราคาต่อเซสชัน</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(course.pricePerSession)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ระยะเวลา</span>
                  <span>{course.durationMinutes} นาที</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2 border-t pt-4">
                <Link href={`/courses/${course.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full"><Eye className="h-3.5 w-3.5" /> ดู</Button>
                </Link>
                <Link href={`/courses/${course.id}/edit`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full"><Edit2 className="h-3.5 w-3.5" /> แก้ไข</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


export const dynamic = 'force-dynamic';
