import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS, type User, type TeacherProfile } from '@/types/firestore';
import { VerificationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, StatCard, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { CheckCircle, Clock3, Search, Star, Users, UserCheck, X, XCircle } from 'lucide-react';
import { getServerAuth } from '@/lib/firebase/server';
import { formatCurrency } from '@/lib/utils';
import { requireAdmin } from '@/lib/auth/guards';

interface TeachersSearchParams {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}

export default async function AdminTeachersPage({ searchParams }: TeachersSearchParams) {
  const auth = getServerAuth();
  const db = getServerDb();
  if (!db) return redirect('/login');

  const { q = '', status = 'all', sort = 'newest' } = await searchParams;
  const query = q.trim().toLowerCase();

  const teachersSnap = await db.collection(COLLECTIONS.USERS)
    .where('role', '==', 'teacher')
    .orderBy('createdAt', 'desc')
    .get();

  const teachers: (User & Partial<TeacherProfile>)[] = [];
  for (const doc of teachersSnap.docs) {
    const userData = { uid: doc.id, ...(doc.data() as any) } as User;
    const teacherSnap = await db.collection(COLLECTIONS.TEACHERS).doc(doc.id).get();
    const teacherData = teacherSnap.exists ? (teacherSnap.data() as Partial<TeacherProfile>) : {};
    teachers.push({ ...userData, ...teacherData });
  }

  // ── คอร์ส + รายได้ต่อครู (batch fetch แล้ว group ใน JS เพื่อเลี่ยง composite index) ──
  const [coursesSnap, paymentsSnap, bookingsSnap] = await Promise.all([
    db.collection(COLLECTIONS.COURSES).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').get(),
    db.collection(COLLECTIONS.BOOKINGS).get(),
  ]);

  const courseStats = new Map<string, { total: number; active: number }>();
  for (const doc of coursesSnap.docs) {
    const c = doc.data() as any;
    if (!c.teacherId) continue;
    const stats = courseStats.get(c.teacherId) ?? { total: 0, active: 0 };
    stats.total += 1;
    if (c.isActive) stats.active += 1;
    courseStats.set(c.teacherId, stats);
  }

  const bookingTeacher = new Map<string, string>();
  for (const doc of bookingsSnap.docs) {
    const b = doc.data() as any;
    if (b.teacherId) bookingTeacher.set(doc.id, b.teacherId);
  }

  const teacherEarnings = new Map<string, number>();
  for (const doc of paymentsSnap.docs) {
    const p = doc.data() as any;
    const teacherId = p.bookingId ? bookingTeacher.get(p.bookingId) : undefined;
    if (!teacherId) continue;
    teacherEarnings.set(teacherId, (teacherEarnings.get(teacherId) ?? 0) + (p.amount || 0));
  }

  const hasFilters = query !== '' || status !== 'all' || sort !== 'newest';

  const filteredTeachers = teachers.filter((t: any) => {
    if (query) {
      const haystack = [t.displayName, t.email, t.bio, t.education]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (status === 'pending' && t.isVerified) return false;
    if (status === 'verified' && !t.isVerified) return false;
    return true;
  });

  const createdMillis = (t: any) => {
    const c = t.createdAt;
    if (!c) return 0;
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c === 'object' && 'seconds' in c) return Number(c.seconds) * 1000;
    return 0;
  };

  const sortedTeachers = [...filteredTeachers].sort((a: any, b: any) => {
    switch (sort) {
      case 'oldest':
        return createdMillis(a) - createdMillis(b);
      case 'name_asc':
        return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'th');
      case 'name_desc':
        return String(b.displayName || '').localeCompare(String(a.displayName || ''), 'th');
      case 'experience_desc':
        return (b.experienceYears || 0) - (a.experienceYears || 0);
      case 'experience_asc':
        return (a.experienceYears || 0) - (b.experienceYears || 0);
      case 'rating_desc':
        return (b.rating || 0) - (a.rating || 0);
      case 'rating_asc':
        return (a.rating || 0) - (b.rating || 0);
      default: // newest
        return createdMillis(b) - createdMillis(a);
    }
  });

  const pendingTeachers = sortedTeachers.filter((t: any) => !t.isVerified);
  const verifiedTeachers = sortedTeachers.filter((t: any) => t.isVerified);
  const showPending = status === 'all' || status === 'pending';
  const showVerified = status === 'all' || status === 'verified';

  async function approveTeacher(teacherId: string) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    await requireAdmin();
    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update({
      isVerified: true,
      verificationLevel: 'full',
    });
  }

  async function rejectTeacher(teacherId: string) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    await requireAdmin();
    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update({
      verificationLevel: 'none',
    });
  }

  const STATS = [
    {
      label: 'ครูทั้งหมด',
      value: teachers.length,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'รออนุมัติ',
      value: pendingTeachers.length,
      icon: <Clock3 className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
    },
    {
      label: 'อนุมัติแล้ว',
      value: verifiedTeachers.length,
      icon: <UserCheck className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="จัดการครู"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <p className="mb-6 text-sm text-slate-500">อนุมัติและจัดการครูพิเศษในระบบ</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconGradient={stat.iconGradient}
          />
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">ครูทั้งหมด ({sortedTeachers.length})</h2>
          {hasFilters && (
            <Link href="/admin/teachers" className="inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:underline">
              <X className="h-4 w-4" />
              ล้างตัวกรอง
            </Link>
          )}
        </div>

        {/* ── Filter bar ── */}
        <form method="GET" action="/admin/teachers" className="mb-5 grid gap-3 rounded-2xl border border-pink-100 bg-white/70 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_auto]">
          <Input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาชื่อ อีเมล bio หรือการศึกษา"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Select
            name="status"
            defaultValue={status}
            options={[
              { value: 'all', label: 'สถานะ: ทั้งหมด' },
              { value: 'pending', label: 'สถานะ: รออนุมัติ' },
              { value: 'verified', label: 'สถานะ: อนุมัติแล้ว' },
            ]}
          />
          <Select
            name="sort"
            defaultValue={sort}
            options={[
              { value: 'newest', label: 'เรียง: ใหม่สุด' },
              { value: 'oldest', label: 'เรียง: เก่าสุด' },
              { value: 'name_asc', label: 'เรียง: ชื่อ ก-ฮ' },
              { value: 'name_desc', label: 'เรียง: ชื่อ ฮ-ก' },
              { value: 'experience_desc', label: 'เรียง: ประสบการณ์มากสุด' },
              { value: 'experience_asc', label: 'เรียง: ประสบการณ์น้อยสุด' },
              { value: 'rating_desc', label: 'เรียง: คะแนนสูงสุด' },
              { value: 'rating_asc', label: 'เรียง: คะแนนต่ำสุด' },
            ]}
          />
          <Button type="submit" size="md">
            <Search className="h-4 w-4" />
            ค้นหา
          </Button>
        </form>

        {sortedTeachers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title={hasFilters ? 'ไม่พบครูที่ตรงเงื่อนไข' : 'ยังไม่มีครู'}
            description={hasFilters ? 'ลองเปลี่ยนคำค้นหรือตัวกรอง' : 'ครูที่สมัครใช้งานจะแสดงที่นี่'}
          />
        ) : (
          <>
            {showPending && (
              <div className={status === 'pending' ? '' : 'mb-8'}>
                <h2 className="mb-4 text-lg font-bold text-slate-900">รอการอนุมัติ ({pendingTeachers.length})</h2>
                {pendingTeachers.length === 0 ? (
                  <EmptyState
                    icon={<UserCheck className="h-7 w-7" />}
                    title="ไม่มีครูที่รอการอนุมัติ"
                    description="ครูใหม่ที่สมัครจะแสดงที่นี่"
                  />
                ) : (
                  <Table headers={['ครู', 'อีเมล', 'ประสบการณ์', 'คะแนน', 'คอร์ส', 'รายได้', 'การจัดการ']}>
                    {pendingTeachers.map((teacher: any) => (
                      <TableRow key={teacher.uid}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Link href={`/admin/teachers/${teacher.uid}`} className="font-semibold text-slate-900 hover:text-pink-600 hover:underline">
                              {teacher.displayName}
                            </Link>
                            <VerificationBadge level={teacher.verificationLevel} />
                          </div>
                          {teacher.bio && (
                            <p className="mt-1 line-clamp-1 text-xs text-slate-400">{teacher.bio}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">{teacher.email}</TableCell>
                        <TableCell className="text-slate-500">{teacher.experienceYears || 0} ปี</TableCell>
                        <TableCell>
                          {teacher.rating > 0 ? (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              {teacher.rating}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">
                          <span className="font-semibold text-slate-700">{courseStats.get(teacher.uid)?.total ?? 0}</span>
                          {(courseStats.get(teacher.uid)?.active ?? 0) > 0 && (
                            <span className="ml-1 text-xs text-emerald-600">({courseStats.get(teacher.uid)?.active} เปิด)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(teacherEarnings.get(teacher.uid) ?? 0) > 0 ? (
                            <div className="leading-tight">
                              <span className="font-semibold text-emerald-600">{formatCurrency(teacherEarnings.get(teacher.uid) ?? 0)}</span>
                              <span className="ml-1.5 text-xs text-slate-400">สุทธิ {formatCurrency((teacherEarnings.get(teacher.uid) ?? 0) * 0.8)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <form action={approveTeacher.bind(null, teacher.uid)}>
                              <Button type="submit" size="sm" variant="success">
                                <CheckCircle className="h-4 w-4" /> อนุมัติ
                              </Button>
                            </form>
                            <form action={rejectTeacher.bind(null, teacher.uid)}>
                              <Button type="submit" size="sm" variant="outline" className="border-rose-300 text-rose-600">
                                <XCircle className="h-4 w-4" /> ปฏิเสธ
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Table>
                )}
              </div>
            )}

            {showVerified && verifiedTeachers.length > 0 && (
              <div className={status === 'verified' ? '' : 'mt-8'}>
                <h2 className="mb-4 text-lg font-bold text-slate-900">ครูที่อนุมัติแล้ว ({verifiedTeachers.length})</h2>
                <Table headers={['ครู', 'อีเมล', 'ประสบการณ์', 'คะแนน', 'คอร์ส', 'รายได้']}>
                  {verifiedTeachers.map((teacher: any) => (
                    <TableRow key={teacher.uid} className="opacity-75">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Link href={`/admin/teachers/${teacher.uid}`} className="font-medium text-slate-900 hover:text-pink-600 hover:underline">
                            {teacher.displayName}
                          </Link>
                          <VerificationBadge level={teacher.verificationLevel} />
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{teacher.email}</TableCell>
                      <TableCell className="text-slate-500">{teacher.experienceYears || 0} ปี</TableCell>
                      <TableCell>
                        {teacher.rating > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {teacher.rating}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        <span className="font-semibold text-slate-700">{courseStats.get(teacher.uid)?.total ?? 0}</span>
                        {(courseStats.get(teacher.uid)?.active ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-emerald-600">({courseStats.get(teacher.uid)?.active} เปิด)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(teacherEarnings.get(teacher.uid) ?? 0) > 0 ? (
                          <div className="leading-tight">
                            <span className="font-semibold text-emerald-600">{formatCurrency(teacherEarnings.get(teacher.uid) ?? 0)}</span>
                            <span className="ml-1.5 text-xs text-slate-400">สุทธิ {formatCurrency((teacherEarnings.get(teacher.uid) ?? 0) * 0.8)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
