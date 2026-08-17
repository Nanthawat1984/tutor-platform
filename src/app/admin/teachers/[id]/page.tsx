import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLLECTIONS, type User, type TeacherProfile, type Course, type Payment } from '@/types/firestore';
import { VerificationBadge, BookingStatusBadge, Badge } from '@/components/ui/badge';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, StatCard, EmptyState, SectionCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { ArrowLeft, BookOpen, CalendarDays, Star, Users, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const FORMAT_LABELS: Record<string, string> = {
  one_on_one: 'ตัวต่อตัว',
  small_group: 'กลุ่มเล็ก',
  online: 'ออนไลน์',
  hybrid: 'ไฮบริด',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  truemoney: 'TrueMoney',
  bank_transfer: 'โอนเงิน',
};

interface TeacherDetailProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTeacherDetailPage({ params }: TeacherDetailProps) {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const { id } = await params;

  const [userSnap, teacherSnap, coursesSnap, bookingsSnap, paymentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(id).get(),
    db.collection(COLLECTIONS.TEACHERS).doc(id).get(),
    db.collection(COLLECTIONS.COURSES).where('teacherId', '==', id).get(),
    db.collection(COLLECTIONS.BOOKINGS).where('teacherId', '==', id).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').get(),
  ]);

  if (!userSnap.exists) notFound();
  const teacher = { uid: id, ...(userSnap.data() as any) } as User & Partial<TeacherProfile>;
  const profile = teacherSnap.exists ? (teacherSnap.data() as Partial<TeacherProfile>) : {};
  Object.assign(teacher, profile);

  const courses = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));
  const activeCourses = courses.filter((c) => c.isActive).length;

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // จับคู่ payment → booking ของครูคนนี้
  const bookingById = new Map(bookings.map((b: any) => [b.id, b]));
  const paidMillis = (p: any) => {
    const t = p.paidAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'object' && 'seconds' in t) return Number(t.seconds) * 1000;
    return 0;
  };

  const payments = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() } as Payment))
    .filter((p) => bookingById.has(p.bookingId))
    .sort((a: any, b: any) => paidMillis(b) - paidMillis(a));

  const totalEarnings = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const completedBookings = bookings.filter((b: any) => b.status === 'completed').length;

  const STATS = [
    {
      label: 'คอร์สทั้งหมด',
      value: courses.length,
      icon: <BookOpen className="h-6 w-6" />,
      iconGradient: 'from-violet-500 to-purple-600',
      subtext: `เปิดสอน ${activeCourses} คอร์ส`,
    },
    {
      label: 'การจองทั้งหมด',
      value: bookings.length,
      icon: <CalendarDays className="h-6 w-6" />,
      iconGradient: 'from-indigo-500 to-blue-600',
      subtext: `เสร็จสิ้น ${completedBookings} ครั้ง`,
    },
    {
      label: 'คะแนนเฉลี่ย',
      value: teacher.rating && teacher.rating > 0 ? teacher.rating : '—',
      icon: <Star className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
      subtext: teacher.totalReviews ? `จาก ${teacher.totalReviews} รีวิว` : 'ยังไม่มีรีวิว',
    },
    {
      label: 'รายได้รวม (ชำระแล้ว)',
      value: formatCurrency(totalEarnings),
      icon: <Wallet className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
      subtext: payments.length > 0
        ? `สุทธิ ${formatCurrency(totalEarnings * 0.8)} หลังหัก 20% • ${payments.length} รายการ`
        : undefined,
    },
  ];

  return (
    <DashboardLayout
      title="รายละเอียดครู"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <Link
        href="/admin/teachers"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปจัดการครู
      </Link>

      {/* ── Teacher Header ── */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-violet-100 bg-white/80 p-5 shadow-sm backdrop-blur">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-edu-gradient text-xl font-extrabold text-white shadow-button">
          {teacher.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teacher.photoURL} alt={teacher.displayName} className="h-full w-full rounded-2xl object-cover" />
          ) : (
            (teacher.displayName || 'ค').charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">{teacher.displayName}</h2>
            <VerificationBadge level={teacher.verificationLevel} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{teacher.email}</p>
          {teacher.bio && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{teacher.bio}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 text-sm text-slate-600">
          {(teacher.experienceYears || 0) > 0 && (
            <span>ประสบการณ์ {teacher.experienceYears} ปี</span>
          )}
          {teacher.education && <span className="text-slate-500">{teacher.education}</span>}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconGradient={stat.iconGradient}
            subtext={stat.subtext}
          />
        ))}
      </div>

      {/* ── Courses ── */}
      <div className="mt-6">
        <SectionCard title={`คอร์สเรียน (${courses.length})`}>
          {courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7" />}
              title="ครูคนนี้ยังไม่มีคอร์ส"
              description="คอร์สที่ครูเปิดสอนจะแสดงที่นี่"
            />
          ) : (
            <Table headers={['คอร์ส', 'วิชา', 'ระดับ', 'รูปแบบ', 'ราคา/ครั้ง', 'สถานะ']}>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <p className="font-semibold text-slate-900">{course.title}</p>
                    {course.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{course.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">{course.subjectName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" size="sm">{course.level}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-500">{FORMAT_LABELS[course.format] ?? course.format}</TableCell>
                  <TableCell className="font-semibold text-slate-700">{formatCurrency(course.pricePerSession)}</TableCell>
                  <TableCell>
                    {course.isActive ? (
                      <Badge variant="success" size="sm" dot>เปิดสอน</Badge>
                    ) : (
                      <Badge variant="default" size="sm" dot>ปิด</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>

      {/* ── Payments / Earnings ── */}
      <div className="mt-6">
        <SectionCard title={`รายได้ (${payments.length} รายการ)`}>
          {payments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-7 w-7" />}
              title="ยังไม่มีการจ่ายเงิน"
              description="การชำระเงินที่ผูกกับบุ๊คกิ้งของครูคนนี้จะแสดงที่นี่"
            />
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => {
                const booking = bookingById.get(payment.bookingId) as any;
                return (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100/60 bg-violet-50/40 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{booking?.courseTitle ?? '—'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        นักเรียน: {booking?.studentName ?? '—'} • {booking?.bookingDate ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {payment.method && (
                        <span className="hidden text-xs text-slate-500 sm:inline">
                          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                        </span>
                      )}
                      <span className="font-bold text-emerald-600">{formatCurrency(payment.amount)}</span>
                      <BookingStatusBadge status={booking?.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
