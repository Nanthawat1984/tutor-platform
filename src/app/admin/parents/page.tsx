import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, StatCard, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { FieldValue } from 'firebase-admin/firestore';
import { GraduationCap, Mail, Phone, Search, Trash2, User, Users, X } from 'lucide-react';

interface ParentsSearchParams {
  searchParams: Promise<{ q?: string; kids?: string; bookings?: string; sort?: string }>;
}

export default async function AdminParentsPage({ searchParams }: ParentsSearchParams) {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const { q = '', kids = 'all', bookings = 'all', sort = 'newest' } = await searchParams;
  const query = q.trim().toLowerCase();

  const [parentsSnap, studentsSnap, bookingsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('role', '==', 'parent').orderBy('createdAt', 'desc').get(),
    db.collection(COLLECTIONS.STUDENTS).get(),
    db.collection(COLLECTIONS.BOOKINGS).get(),
  ]);

  const parents = parentsSnap.docs.map((doc: any) => ({ uid: doc.id, ...doc.data() }));

  // group students + bookings by parentId (ใน JS เพื่อเลี่ยง composite index)
  const studentsByParent = new Map<string, number>();
  studentsSnap.docs.forEach((d) => {
    const parentId = (d.data() as any).parentId;
    if (parentId) studentsByParent.set(parentId, (studentsByParent.get(parentId) || 0) + 1);
  });

  const bookingsByParent = new Map<string, number>();
  bookingsSnap.docs.forEach((d) => {
    const parentId = (d.data() as any).parentId;
    if (parentId) bookingsByParent.set(parentId, (bookingsByParent.get(parentId) || 0) + 1);
  });

  const totalStudents = studentsSnap.size;
  const totalBookings = bookingsSnap.size;

  const hasFilters = query !== '' || kids !== 'all' || bookings !== 'all';

  const filteredParents = parents.filter((parent: any) => {
    if (query) {
      const haystack = [parent.displayName, parent.email, parent.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    const studentCount = studentsByParent.get(parent.uid) || 0;
    const bookingCount = bookingsByParent.get(parent.uid) || 0;
    if (kids === 'has' && studentCount === 0) return false;
    if (kids === 'none' && studentCount > 0) return false;
    if (bookings === 'has' && bookingCount === 0) return false;
    if (bookings === 'none' && bookingCount > 0) return false;
    return true;
  });

  const createdMillis = (p: any) => {
    const t = p.createdAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'object' && 'seconds' in t) return Number(t.seconds) * 1000;
    return 0;
  };

  const sortedParents = [...filteredParents].sort((a: any, b: any) => {
    switch (sort) {
      case 'oldest':
        return createdMillis(a) - createdMillis(b);
      case 'name_asc':
        return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'th');
      case 'name_desc':
        return String(b.displayName || '').localeCompare(String(a.displayName || ''), 'th');
      case 'students_desc':
        return (studentsByParent.get(b.uid) || 0) - (studentsByParent.get(a.uid) || 0);
      case 'students_asc':
        return (studentsByParent.get(a.uid) || 0) - (studentsByParent.get(b.uid) || 0);
      case 'bookings_desc':
        return (bookingsByParent.get(b.uid) || 0) - (bookingsByParent.get(a.uid) || 0);
      case 'bookings_asc':
        return (bookingsByParent.get(a.uid) || 0) - (bookingsByParent.get(b.uid) || 0);
      default: // newest
        return createdMillis(b) - createdMillis(a);
    }
  });

  async function deleteParentAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const parentId = formData.get('parentId') as string;

    const [students, bookings] = await Promise.all([
      dbRef.collection(COLLECTIONS.STUDENTS).where('parentId', '==', parentId).get(),
      dbRef.collection(COLLECTIONS.BOOKINGS).where('parentId', '==', parentId).get(),
    ]);

    const batch = dbRef.batch();
    students.docs.forEach((d) => batch.delete(d.ref));
    bookings.docs.forEach((d) =>
      batch.update(d.ref, {
        status: 'cancelled',
        notes: (d.data().notes ? d.data().notes + ' | ' : '') + 'ยกเลิกโดย admin (ลบบัญชีผู้ปกครอง)',
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
    batch.delete(dbRef.collection(COLLECTIONS.USERS).doc(parentId));
    await batch.commit();

    redirect('/admin/parents');
  }

  const STATS = [
    {
      label: 'ผู้ปกครองทั้งหมด',
      value: parents.length,
      icon: <Users className="h-6 w-6" />,
      iconGradient: 'from-violet-500 to-purple-600',
    },
    {
      label: 'นักเรียนทั้งหมด',
      value: totalStudents,
      icon: <GraduationCap className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
    },
    {
      label: 'การจองทั้งหมด',
      value: totalBookings,
      icon: <User className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="ผู้ปกครอง"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <p className="mb-6 text-sm text-slate-500">รายชื่อผู้ปกครองและนักเรียนทั้งหมดในระบบ</p>

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
          <h2 className="text-lg font-bold text-slate-900">ผู้ปกครองทั้งหมด ({filteredParents.length})</h2>
          {hasFilters && (
            <Link href="/admin/parents" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 hover:underline">
              <X className="h-4 w-4" />
              ล้างตัวกรอง
            </Link>
          )}
        </div>

        {/* ── Filter bar ── */}
        <form method="GET" action="/admin/parents" className="mb-5 grid gap-3 rounded-2xl border border-violet-100 bg-white/70 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_180px_auto]">
          <Input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Select
            name="kids"
            defaultValue={kids}
            options={[
              { value: 'all', label: 'ลูก: ทั้งหมด' },
              { value: 'has', label: 'ลูก: มีลูกในระบบ' },
              { value: 'none', label: 'ลูก: ไม่มีลูก' },
            ]}
          />
          <Select
            name="bookings"
            defaultValue={bookings}
            options={[
              { value: 'all', label: 'การจอง: ทั้งหมด' },
              { value: 'has', label: 'การจอง: มีการจอง' },
              { value: 'none', label: 'การจอง: ไม่มีการจอง' },
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
              { value: 'students_desc', label: 'เรียง: ลูกมากสุด' },
              { value: 'students_asc', label: 'เรียง: ลูกน้อยสุด' },
              { value: 'bookings_desc', label: 'เรียง: จองมากสุด' },
              { value: 'bookings_asc', label: 'เรียง: จองน้อยสุด' },
            ]}
          />
          <Button type="submit" size="md">
            <Search className="h-4 w-4" />
            ค้นหา
          </Button>
        </form>

        {filteredParents.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title={hasFilters ? 'ไม่พบผู้ปกครองที่ตรงเงื่อนไข' : 'ยังไม่มีผู้ปกครอง'}
            description={hasFilters ? 'ลองเปลี่ยนคำค้นหรือตัวกรอง' : 'ผู้ปกครองที่สมัครใช้งานจะแสดงที่นี่'}
          />
        ) : (
          <Table headers={['ผู้ปกครอง', 'อีเมล', 'เบอร์โทร', 'ลูก', 'การจอง', 'การจัดการ']}>
            {sortedParents.map((parent: any) => {
              const studentCount = studentsByParent.get(parent.uid) || 0;
              const bookingCount = bookingsByParent.get(parent.uid) || 0;
              return (
                <TableRow key={parent.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
                        {parent.displayName?.charAt(0) ?? 'ผ'}
                      </div>
                      <span className="font-semibold text-slate-900">{parent.displayName || 'ไม่ระบุชื่อ'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500">{parent.email}</TableCell>
                  <TableCell className="text-slate-500">{parent.phone || '—'}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
                      <GraduationCap className="h-3 w-3" />
                      {studentCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                      <User className="h-3 w-3" />
                      {bookingCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <form action={deleteParentAction}>
                      <input type="hidden" name="parentId" value={parent.uid} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={(e) => {
                          if (!confirm(`ลบบัญชี ${parent.displayName || 'ผู้ปกครอง'}?\n\nจะลบรายชื่อลูก ${studentCount} คน และยกเลิกการจอง ${bookingCount} รายการ — ไม่สามารถย้อนกลับได้`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        ลบ
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
