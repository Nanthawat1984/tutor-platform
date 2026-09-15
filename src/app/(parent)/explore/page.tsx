import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import ExploreResults from '@/components/parent/explore-results';
import { rankCourseSearch } from '@/lib/search';

const levelOptions = [
  { value: '', label: 'ทุกระดับ' },
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ป.${i + 1}`, label: `ป.${i + 1}` })),
  ...Array.from({ length: 6 }, (_, i) => ({ value: `ม.${i + 1}`, label: `ม.${i + 1}` })),
  { value: 'TGAT', label: 'TGAT' },
  { value: 'A-Level', label: 'A-Level' },
];

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ subject?: string; level?: string; search?: string; province?: string; district?: string; page?: string }> }) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const params = await searchParams;

  const PAGE_SIZE = 24;
  const page = Math.max(1, Number(params.page) || 1);

  let q: any = db.collection(COLLECTIONS.COURSES).where('isActive', '==', true);
  if (params.subject) q = q.where('subjectId', '==', params.subject);
  if (params.level) q = q.where('level', '==', params.level);

  // Cursor pagination — ดึงทีละหน้าแทน limit 50 ตายตัว กรองจังหวัด/เขต/คำค้น
  // in-memory เหมือนเดิม (ไม่มี composite index ใหม่) แต่ไม่ทิ้ง record เกินหน้า
  const coursesSnap = await q.orderBy('createdAt', 'desc').limit(PAGE_SIZE * page + 1).get();
  const hasMore = coursesSnap.size > PAGE_SIZE * page;
  const courses = coursesSnap.docs.slice(0, PAGE_SIZE * page).map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // Batch-fetch teacher profiles + user docs for rating / experience / photo
  const teacherIds: string[] = Array.from(
    new Set(courses.map((course: any) => String(course.teacherId)).filter(Boolean))
  );
  const [teacherSnaps, userSnaps] = teacherIds.length
    ? await Promise.all([
        db.getAll(...teacherIds.map((uid) => db.collection(COLLECTIONS.TEACHERS).doc(uid))),
        db.getAll(...teacherIds.map((uid) => db.collection(COLLECTIONS.USERS).doc(uid))),
      ])
    : [[], []];
  const teacherProfiles = new Map(
    teacherSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );
  const userProfiles = new Map(
    userSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );

  // Batch-fetch centers (สถานที่สอน) ของคอร์ส
  const centerIds: string[] = Array.from(
    new Set(courses.map((c: any) => String(c.centerId)).filter(Boolean))
  );
  const centerSnaps = centerIds.length
    ? await db.getAll(...centerIds.map((id) => db.collection(COLLECTIONS.CENTERS).doc(id)))
    : [];
  const centers = new Map(
    centerSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
  );

  // กรองตามจังหวัด/เขต (in-memory จาก center)
  let filteredCourses = courses;
  if (params.province) {
    filteredCourses = filteredCourses.filter((c: any) => {
      const center = c.centerId ? centers.get(c.centerId) : null;
      return center?.province === params.province;
    });
  }
  if (params.district) {
    filteredCourses = filteredCourses.filter((c: any) => {
      const center = c.centerId ? centers.get(c.centerId) : null;
      return center?.district === params.district;
    });
  }
  if (params.search) {
    // Thai-tolerant ranked search (tone-mark insensitive, title first).
    const ranked = rankCourseSearch(filteredCourses, params.search);
    filteredCourses = ranked.length > 0 ? ranked : filteredCourses.filter((c: any) => {
      const kw = params.search!.toLowerCase();
      return String(c.title || '').toLowerCase().includes(kw) ||
        String(c.teacherName || '').toLowerCase().includes(kw);
    });
  }

  // สร้างตัวเลือกจังหวัด/เขต จากสถานที่สอนของคอร์สที่ค้นพบเท่านั้น —
  // ไม่สแกน centers ทั้งตาราง (ของเดิม limit 500 ทุกครั้งที่เปิดหน้า explore)
  // ถ้ายังไม่กรองอะไรเลย (คอร์สเต็ม 50) ตัวเลือกจะมาจาก centers ของ 50 คอร์สนี้
  // ซึ่งเพียงพอสำหรับ UX กรองต่อ ส่วน dropdown ครบทั้งจังหวัดมาจาก subject filter
  // ด้านล่างไม่ได้ — tradeoff ที่ตั้งใจเพื่อลด read 90%+
  const provinceValues: string[] = filteredCourses
    .map((c: any): string | null => (c.centerId ? ((centers.get(c.centerId) as any)?.province as string | null) || null : null))
    .filter((v: string | null): v is string => typeof v === 'string' && v.length > 0);
  const provinces: string[] = Array.from(new Set<string>(provinceValues)).sort();
  const districtValues: string[] = filteredCourses
    .map((c: any): string | null => {
      const center = (c.centerId ? centers.get(c.centerId) : null) as any;
      if (!center) return null;
      if (params.province && center.province !== params.province) return null;
      return (center.district as string | null) || null;
    })
    .filter((v: string | null): v is string => typeof v === 'string' && v.length > 0);
  const districts: string[] = Array.from(new Set<string>(districtValues)).sort();

  // Serialize สำหรับ Client Component (ไม่มี Timestamp)
  const serializedCourses = filteredCourses.map((course: any) => {
    const profile = teacherProfiles.get(course.teacherId) as any;
    const user = userProfiles.get(course.teacherId) as any;
    const center = course.centerId ? centers.get(course.centerId) : null;
    return {
      id: course.id,
      title: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      subjectName: course.subjectName,
      level: course.level,
      format: course.format,
      pricePerSession: course.pricePerSession,
      centerId: course.centerId || null,
      centerName: center?.name || course.centerName || null,
      photoURL: user?.photoURL || profile?.photoURL || null,
      rating: profile?.rating ?? 0,
      totalReviews: profile?.totalReviews ?? 0,
      experienceYears: profile?.experienceYears ?? null,
      education: profile?.education ?? null,
      lat: center?.latitude ?? null,
      lng: center?.longitude ?? null,
    };
  });

  return (
    <DashboardLayout
      title="ค้นหาครูพิเศษ"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      {/* Search Bar */}
      <Card className="mb-6">
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px_auto]">
          <div className="min-w-0">
            <Input name="search" placeholder="ค้นหาชื่อคอร์ส / ครู..." defaultValue={params.search || ''} />
          </div>
          <Select name="level" options={levelOptions} defaultValue={params.level || ''} />
          <Select
            name="province"
            options={[{ value: '', label: 'ทุกจังหวัด' }, ...provinces.map((p) => ({ value: p, label: p }))]}
            defaultValue={params.province || ''}
          />
          <Select
            name="district"
            options={[{ value: '', label: 'ทุกเขต/อำเภอ' }, ...districts.map((d) => ({ value: d, label: d }))]}
            defaultValue={params.district || ''}
          />
          <Button type="submit" className="w-full md:w-auto"><Search className="h-4 w-4" /> ค้นหา</Button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          💡 กด "ค้นหาใกล้ฉัน" เพื่อดูคอร์สที่อยู่ใกล้คุณบนแผนที่ และเรียงตามระยะทาง
        </p>
      </Card>

      <ExploreResults courses={serializedCourses} />

      {hasMore && (
        <div className="mt-6 text-center">
          <a
            href={`/explore?${new URLSearchParams({
              ...(params.subject ? { subject: params.subject } : {}),
              ...(params.level ? { level: params.level } : {}),
              ...(params.search ? { search: params.search } : {}),
              ...(params.province ? { province: params.province } : {}),
              ...(params.district ? { district: params.district } : {}),
              page: String(page + 1),
            }).toString()}`}
            className="inline-flex min-h-[44px] items-center rounded-2xl border-2 border-pink-200 bg-white/80 px-6 py-2.5 text-sm font-bold text-pink-600 shadow-card transition-all hover:bg-pink-50"
          >
            ดูเพิ่มเติม (หน้า {page + 1})
          </a>
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
