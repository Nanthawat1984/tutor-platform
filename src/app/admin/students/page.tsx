import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, StatCard, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { ConfirmDeleteButton } from '@/components/admin/confirm-delete-button';
import { FieldValue } from 'firebase-admin/firestore';
import { GraduationCap, School, Search, StickyNote, Users, X } from 'lucide-react';

interface StudentsSearchParams {
  searchParams: Promise<{ q?: string; level?: string; sort?: string }>;
}

async function deleteStudentAction(formData: FormData) {
  'use server';
  const dbRef = getServerDb();
  if (!dbRef) return;
  const studentId = formData.get('studentId') as string;

  const bookingsSnap = await dbRef.collection(COLLECTIONS.BOOKINGS)
    .where('studentId', '==', studentId)
    .get();

  const batch = dbRef.batch();
  bookingsSnap.docs.forEach((d) =>
    batch.update(d.ref, {
      status: 'cancelled',
      notes: (d.data().notes ? d.data().notes + ' | ' : '') + 'ยกเลิกโดย admin (ลบรายชื่อนักเรียน)',
      updatedAt: FieldValue.serverTimestamp(),
    })
  );
  batch.delete(dbRef.collection(COLLECTIONS.STUDENTS).doc(studentId));
  await batch.commit();

  redirect('/admin/students');
}

export default async function AdminStudentsPage({ searchParams }: StudentsSearchParams) {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const { q = '', level = 'all', sort = 'newest' } = await searchParams;
  const query = q.trim().toLowerCase();

  const [studentsSnap, parentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.STUDENTS).orderBy('createdAt', 'desc').get(),
    db.collection(COLLECTIONS.USERS).where('role', '==', 'parent').get(),
  ]);

  const students = studentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // map parentId → displayName
  const parentNames = new Map<string, string>();
  parentsSnap.docs.forEach((d) => {
    const data = d.data() as any;
    parentNames.set(d.id, data.displayName || data.email || 'ไม่ระบุชื่อ');
  });

  const levels = new Map<string, number>();
  students.forEach((s: any) => {
    const lvl = s.level || 'ไม่ระบุ';
    levels.set(lvl, (levels.get(lvl) || 0) + 1);
  });
  const distinctLevels = levels.size;

  const levelOptions = [...levels.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  const hasFilters = query !== '' || level !== 'all';

  const filteredStudents = students.filter((student: any) => {
    if (query) {
      const haystack = [student.name, student.school, student.notes, parentNames.get(student.parentId)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (level !== 'all' && (student.level || 'ไม่ระบุ') !== level) return false;
    return true;
  });

  const createdMillis = (s: any) => {
    const t = s.createdAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'object' && 'seconds' in t) return Number(t.seconds) * 1000;
    return 0;
  };

  const sortedStudents = [...filteredStudents].sort((a: any, b: any) => {
    switch (sort) {
      case 'oldest':
        return createdMillis(a) - createdMillis(b);
      case 'name_asc':
        return String(a.name || '').localeCompare(String(b.name || ''), 'th');
      case 'name_desc':
        return String(b.name || '').localeCompare(String(a.name || ''), 'th');
      case 'level_asc':
        return String(a.level || 'ไม่ระบุ').localeCompare(String(b.level || 'ไม่ระบุ'), 'th');
      case 'level_desc':
        return String(b.level || 'ไม่ระบุ').localeCompare(String(a.level || 'ไม่ระบุ'), 'th');
      default: // newest
        return createdMillis(b) - createdMillis(a);
    }
  });

    const STATS = [
    {
      label: 'นักเรียนทั้งหมด',
      value: students.length,
      icon: <GraduationCap className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'ผู้ปกครองในระบบ',
      value: parentNames.size,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
    {
      label: 'ระดับชั้นที่พบ',
      value: distinctLevels,
      icon: <School className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="นักเรียน"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <p className="mb-6 text-sm text-slate-500">รายชื่อนักเรียนทั้งหมดที่ผู้ปกครองบันทึกในระบบ</p>

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
          <h2 className="text-lg font-bold text-slate-900">นักเรียนทั้งหมด ({filteredStudents.length})</h2>
          {hasFilters && (
            <Link href="/admin/students" className="inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:underline">
              <X className="h-4 w-4" />
              ล้างตัวกรอง
            </Link>
          )}
        </div>

        {/* ── Filter bar ── */}
        <form method="GET" action="/admin/students" className="mb-5 grid gap-3 rounded-2xl border border-pink-100 bg-white/70 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]">
          <Input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาชื่อนักเรียน โรงเรียน หรือผู้ปกครอง"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Select
            name="level"
            defaultValue={level}
            options={[
              { value: 'all', label: 'ระดับชั้น: ทั้งหมด' },
              ...levelOptions.map((lvl) => ({ value: lvl, label: lvl })),
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
              { value: 'level_asc', label: 'เรียง: ระดับชั้น' },
              { value: 'level_desc', label: 'เรียง: ระดับชั้น (กลับ)' },
            ]}
          />
          <Button type="submit" size="md">
            <Search className="h-4 w-4" />
            ค้นหา
          </Button>
        </form>

        {filteredStudents.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-7 w-7" />}
            title={hasFilters ? 'ไม่พบนักเรียนที่ตรงเงื่อนไข' : 'ยังไม่มีนักเรียน'}
            description={hasFilters ? 'ลองเปลี่ยนคำค้นหรือตัวกรอง' : 'เมื่อผู้ปกครองเพิ่มรายชื่อลูกในระบบ รายชื่อจะแสดงที่นี่'}
          />
        ) : (
          <Table headers={['นักเรียน', 'ระดับชั้น', 'ผู้ปกครอง', 'โรงเรียน', 'หมายเหตุ', 'การจัดการ']}>
            {sortedStudents.map((student: any) => (
              <TableRow key={student.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-xs font-bold text-white">
                      {student.name?.charAt(0) ?? 'น'}
                    </div>
                    <span className="font-semibold text-slate-900">{student.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {student.level ? (
                    <Badge variant="primary">{student.level}</Badge>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-500">{parentNames.get(student.parentId) || 'ไม่ระบุ'}</TableCell>
                <TableCell className="text-slate-500">
                  {student.school ? (
                    <span className="inline-flex items-center gap-1.5">
                      <School className="h-3.5 w-3.5 text-slate-400" />
                      {student.school}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {student.notes ? (
                    <span className="flex items-start gap-1.5 text-xs text-amber-800">
                      <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span className="line-clamp-1">{student.notes}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                    <ConfirmDeleteButton
                      action={deleteStudentAction}
                      hiddenName="studentId"
                      hiddenValue={student.id}
                      confirmMessage={`ลบรายชื่อ ${student.name}?\n\nจะลบออกจากระบบและยกเลิกการจองที่อ้างถึง — ไม่สามารถย้อนกลับได้`}
                    />
                  </TableCell>
              </TableRow>
            ))}
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
