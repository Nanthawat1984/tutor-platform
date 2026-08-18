import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, getInitials } from '@/lib/utils';

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const { id } = await params;

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(id).get();

  if (!courseSnap.exists) notFound();

  const course = { id: courseSnap.id, ...courseSnap.data() } as any;
  const isOwner = false; // TODO: check session

  return (
    <DashboardLayout
      title="รายละเอียดคอร์ส"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName="คุณครู"
    >
      {isOwner && (
        <div className="responsive-actions mb-6">
          <Link href={`/courses/${id}/edit`} className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">แก้ไขคอร์ส</Button>
          </Link>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 font-bold text-2xl text-pink-700">
            {getInitials(course.teacherName || 'ครู')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
                <p className="mt-1 text-gray-500">ครู{course.teacherName}</p>
              </div>
              <Badge variant={course.isActive ? 'success' : 'default'}>
                {course.isActive ? 'เปิดรับ' : 'ปิด'}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info">{course.subjectName}</Badge>
              <Badge variant="outline">ระดับ {course.level}</Badge>
              <Badge variant="outline">
                {course.format === 'one_on_one' ? '1-on-1' :
                 course.format === 'small_group' ? 'กลุ่มเล็ก' :
                 course.format === 'online' ? 'ออนไลน์' : 'ผสม'}
              </Badge>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-gray-500">ราคาต่อเซสชัน</p>
                <p className="text-xl font-bold text-pink-700">{formatCurrency(course.pricePerSession)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ระยะเวลา</p>
                <p className="text-xl font-semibold">{course.durationMinutes} นาที</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">จำนวนสูงสุด</p>
                <p className="text-xl font-semibold">{course.maxStudents} คน</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {course.description && (
        <Card className="mt-6">
          <h2 className="font-semibold text-gray-900">รายละเอียดคอร์ส</h2>
          <p className="mt-2 text-gray-600 whitespace-pre-wrap">{course.description}</p>
        </Card>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
