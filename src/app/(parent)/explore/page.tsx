import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Search, Star, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLLECTIONS } from '@/types/firestore';
import type { Course } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';

const levelOptions = [
  { value: '', label: 'ทุกระดับ' },
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ป.${i + 1}`, label: `ป.${i + 1}` })),
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ม.${i + 1}`, label: `ม.${i + 1}` })),
  { value: 'TGAT', label: 'TGAT' },
  { value: 'A-Level', label: 'A-Level' },
];

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ subject?: string; level?: string; search?: string }> }) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const params = await searchParams;

  let q: any = db.collection(COLLECTIONS.COURSES).where('isActive', '==', true);
  if (params.subject) q = q.where('subjectId', '==', params.subject);
  if (params.level) q = q.where('level', '==', params.level);

  const coursesSnap = await q.orderBy('createdAt', 'desc').limit(30).get();
  const courses = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));
  const subjectsSnap = await db.collection(COLLECTIONS.SUBJECTS).where('isActive', '==', true).orderBy('sortOrder').get();
  const subjects = subjectsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ค้นหาครูพิเศษ</h1>
        <p className="text-sm text-gray-500">เลือกครูตามวิชา ระดับชั้น และพื้นที่</p>
      </div>

      <Card>
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <div className="min-w-0">
            <Input name="search" placeholder="ค้นหาชื่อคอร์ส..." defaultValue={params.search || ''} />
          </div>
          <Select name="level" options={levelOptions} defaultValue={params.level || ''} />
          <Button type="submit" className="w-full md:w-auto"><Search className="h-4 w-4" /> ค้นหา</Button>
        </form>
      </Card>

      {courses.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Search className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-medium">ไม่พบคอร์สที่ตรงกับการค้นหา</h3>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => (
            <Card key={course.id} className="flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold">
                  {(course.teacherName?.[0] || 'ค').toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{course.teacherName}</h3>
                  <div className="flex items-center gap-1 text-sm text-yellow-600">
                    <Star className="h-3.5 w-3.5 fill-yellow-400" />
                    <span>0.0</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <h4 className="font-medium">{course.title}</h4>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="info">{course.subjectName}</Badge>
                  <Badge variant="outline">{course.level}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3.5 w-3.5" /> {course.durationMinutes} นาที</span>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-lg font-bold text-blue-600">{formatCurrency(course.pricePerSession)}<span className="text-xs font-normal text-gray-400"> /เซสชัน</span></span>
                <Link href={`/bookings/new?course_id=${course.id}`} className="w-full sm:w-auto"><Button size="sm" className="w-full sm:w-auto">จองเลย</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


export const dynamic = 'force-dynamic';
