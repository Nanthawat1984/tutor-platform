import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Plus, Edit2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
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
    <DashboardLayout
      title="คอร์สเรียน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName="คุณครู"
    >
      <div className="responsive-page-header mb-6">
        <p className="text-sm text-slate-500">จัดการคอร์สเรียนที่คุณเปิดสอน</p>
        <Link href="/courses/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto"><Plus className="h-4 w-4" /> สร้างคอร์สใหม่</Button>
        </Link>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title="ยังไม่มีคอร์สเรียน"
          description="เริ่มสร้างคอร์สแรกของคุณ"
          action={{ label: 'สร้างคอร์สใหม่', href: '/courses/new' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => (
            <Card key={course.id} className="flex flex-col" hoverable>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
                <div className="flex justify-between gap-4">
                  <span>รูปแบบ</span>
                  <span className="font-medium">{formatLabels[course.format] || course.format}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>ราคาต่อเซสชัน</span>
                  <span className="font-semibold text-violet-700">{formatCurrency(course.pricePerSession)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>ระยะเวลา</span>
                  <span>{course.durationMinutes} นาที</span>
                </div>
              </div>
              <div className="mt-4 grid gap-2 border-t border-violet-100/60 pt-4 sm:grid-cols-2">
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
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
