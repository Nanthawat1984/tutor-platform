import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Search, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { RatingStars } from '@/components/ui/rating';
import { COLLECTIONS } from '@/types/firestore';
import type { Course } from '@/types/firestore';
import { formatCurrency, getInitials } from '@/lib/utils';

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

  // Batch-fetch teacher profiles + user docs for rating / experience / photo
  const teacherIds: string[] = Array.from(
    new Set(courses.map((course: any) => String(course.teacherId)).filter(Boolean))
  );
  const teacherRefs = teacherIds.map((uid) => db.collection(COLLECTIONS.TEACHERS).doc(uid));
  const userRefs = teacherIds.map((uid) => db.collection(COLLECTIONS.USERS).doc(uid));
  const [teacherSnaps, userSnaps] = teacherIds.length
    ? await Promise.all([
        db.getAll(...teacherRefs),
        db.getAll(...userRefs),
      ])
    : [[], []];
  const teacherProfiles = new Map(
    teacherSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );
  const userProfiles = new Map(
    userSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );

  return (
    <DashboardLayout
      title="ค้นหาครูพิเศษ"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName="ผู้ปกครอง"
    >
      {/* Search Bar */}
      <Card className="mb-6">
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <div className="min-w-0">
            <Input name="search" placeholder="ค้นหาชื่อคอร์ส..." defaultValue={params.search || ''} />
          </div>
          <Select name="level" options={levelOptions} defaultValue={params.level || ''} />
          <Button type="submit" className="w-full md:w-auto"><Search className="h-4 w-4" /> ค้นหา</Button>
        </form>
      </Card>

      {courses.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="ไม่พบคอร์สที่ตรงกับการค้นหา"
          description="ลองเปลี่ยนวิชาหรือระดับชั้น แล้วค้นหาอีกครั้ง"
          action={{ label: 'ดูคอร์สทั้งหมด', href: '/explore' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => {
            const profile = teacherProfiles.get(course.teacherId) as any;
            const user = userProfiles.get(course.teacherId) as any;
            const photoURL = user?.photoURL || profile?.photoURL;
            const rating = profile?.rating ?? 0;
            const totalReviews = profile?.totalReviews ?? 0;
            return (
              <Card key={course.id} className="flex flex-col hoverable">
                {/* Teacher header — links to profile */}
                <Link href={`/teachers/${course.teacherId}`} className="group flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-rose-100">
                    {photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoURL}
                        alt={course.teacherName || 'ครู'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-bold text-pink-700">
                        {getInitials(course.teacherName || 'ครู')}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold text-gray-900 group-hover:text-pink-700">
                        ครู{course.teacherName}
                      </h3>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pink-400 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <RatingStars rating={rating} showValue reviewCount={totalReviews} size="sm" className="mt-0.5" />
                    {profile?.experienceYears != null && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <GraduationCap className="h-3 w-3" />
                        ประสบการณ์ {profile.experienceYears} ปี{profile?.education ? ` • ${profile.education}` : ''}
                      </p>
                    )}
                  </div>
                </Link>

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

                <div className="mt-4 flex flex-col gap-3 border-t border-pink-100/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-lg font-bold text-pink-700">{formatCurrency(course.pricePerSession)}<span className="text-xs font-normal text-gray-400"> /เซสชัน</span></span>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Link href={`/teachers/${course.teacherId}`} className="w-full sm:w-auto">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">โปรไฟล์</Button>
                    </Link>
                    <Link href={`/bookings/new?course_id=${course.id}`} className="w-full sm:w-auto"><Button size="sm" className="w-full sm:w-auto">จองเลย</Button></Link>
                  </div>
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
