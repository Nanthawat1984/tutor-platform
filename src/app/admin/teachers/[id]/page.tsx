import { redirect } from 'next/navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAuth } from '@/lib/firebase/server';
import { COLLECTIONS, type User, type TeacherProfile, type Course, type Payment } from '@/types/firestore';
import { VerificationBadge, BookingStatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, StatCard, EmptyState, SectionCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { ArrowLeft, BookOpen, CalendarDays, ExternalLink, FileCheck2, FileText, History, Star, Users, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { requireAdmin } from '@/lib/auth/guards';
import { buildTeacherReviewUpdate, canApproveTeacher, deriveAdminReviewStatus } from '@/lib/auth/teacher-verification';

const FORMAT_LABELS: Record<string, string> = {
  one_on_one: 'ตัวต่อตัว',
  small_group: 'กลุ่มเล็ก',
  online: 'ออนไลน์',
  hybrid: 'ไฮบริด',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe_checkout: 'Stripe Checkout',
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  truemoney: 'TrueMoney',
  bank_transfer: 'โอนเงิน',
};

function formatTimestamp(value: unknown): string {
  if (!value) return '—';
  const millis = typeof (value as { toMillis?: () => number }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'object' && value !== null && 'seconds' in value
      ? Number((value as { seconds: number }).seconds) * 1000
      : 0;
  return millis ? new Date(millis).toLocaleString('th-TH') : '—';
}

interface TeacherDetailProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}

export default async function AdminTeacherDetailPage({ params, searchParams }: TeacherDetailProps) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const { error, saved } = await searchParams;

  const [userSnap, teacherSnap, coursesSnap, bookingsSnap, paymentsSnap, eventsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(id).get(),
    db.collection(COLLECTIONS.TEACHERS).doc(id).get(),
    db.collection(COLLECTIONS.COURSES).where('teacherId', '==', id).get(),
    db.collection(COLLECTIONS.BOOKINGS).where('teacherId', '==', id).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').get(),
    db.collection(COLLECTIONS.TEACHER_VERIFICATION_EVENTS).where('teacherId', '==', id).get(),
  ]);

  if (!userSnap.exists) notFound();
  const teacher = { uid: id, ...(userSnap.data() as any) } as User & Partial<TeacherProfile>;
  const profile = teacherSnap.exists ? (teacherSnap.data() as Partial<TeacherProfile>) : {};
  Object.assign(teacher, profile);

  const courses = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));
  const activeCourses = courses.filter((c) => c.isActive).length;

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const sortedBookings = [...bookings].sort((a: any, b: any) => {
    const aKey = `${a.bookingDate || ''} ${a.startTime || ''}`;
    const bKey = `${b.bookingDate || ''} ${b.startTime || ''}`;
    return bKey.localeCompare(aKey);
  }).slice(0, 50);

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
  const reviewStatus = deriveAdminReviewStatus(teacher);
  const emailVerified = teacher.emailVerified ?? teacher.verificationLevel !== 'none';
  const events = eventsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const aMillis = typeof a.createdAt?.toMillis === 'function'
        ? a.createdAt.toMillis()
        : typeof a.createdAt?.seconds === 'number' ? a.createdAt.seconds * 1000 : 0;
      const bMillis = typeof b.createdAt?.toMillis === 'function'
        ? b.createdAt.toMillis()
        : typeof b.createdAt?.seconds === 'number' ? b.createdAt.seconds * 1000 : 0;
      return bMillis - aMillis;
    });

  async function reviewTeacher(formData: FormData) {
    'use server';
    const { db: dbRef, session } = await requireAdmin();
    const teacherId = String(formData.get('teacherId') || '').trim();
    const decision = String(formData.get('decision') || '');
    const note = String(formData.get('note') || '').trim();
    if (!teacherId || (decision !== 'approved' && decision !== 'rejected')) return;

    const userRef = dbRef.collection(COLLECTIONS.USERS).doc(teacherId);
    const currentSnap = await userRef.get();
    if (!currentSnap.exists || currentSnap.data()?.role !== 'teacher') return;

    const current = currentSnap.data() as Record<string, unknown>;
    const auth = getServerAuth();
    let emailVerifiedNow = current.emailVerified === true;
    if (auth) {
      try {
        emailVerifiedNow = (await auth.getUser(teacherId)).emailVerified === true;
      } catch {
        // Keep the persisted value if Firebase Auth cannot be read during review.
      }
    }
    if (decision === 'approved' && !canApproveTeacher(current)) {
      redirect(`/admin/teachers/${teacherId}?error=documents_required`);
    }

    const reviewUpdate = buildTeacherReviewUpdate(
      decision,
      emailVerifiedNow,
      note,
    );

    const batch = dbRef.batch();
    batch.update(userRef, {
      ...reviewUpdate,
      adminReviewedAt: FieldValue.serverTimestamp(),
      adminReviewedBy: session.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const eventRef = dbRef.collection(COLLECTIONS.TEACHER_VERIFICATION_EVENTS).doc();
    batch.set(eventRef, {
      teacherId,
      action: decision,
      reviewerUid: session.uid,
      note: note || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    redirect(`/admin/teachers/${teacherId}?saved=${decision}`);
  }

  const STATS = [
    {
      label: 'คอร์สทั้งหมด',
      value: courses.length,
      icon: <BookOpen className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
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
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-pink-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปจัดการครู
      </Link>

      {/* ── Teacher Header ── */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-pink-100 bg-white/80 p-5 shadow-sm backdrop-blur">
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
            <Badge
              variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'rejected' ? 'danger' : 'warning'}
              dot
            >
              {reviewStatus === 'approved' ? 'Admin อนุมัติแล้ว' : reviewStatus === 'rejected' ? 'ไม่ผ่านการตรวจ' : 'รอ Admin ตรวจ'}
            </Badge>
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

      {error === 'documents_required' && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ยังอนุมัติไม่ได้: ต้องมีบัตรประชาชนและสมุดบัญชีธนาคารครบก่อน
        </div>
      )}
      {saved && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          บันทึกผลการตรวจสอบแล้ว: {saved === 'approved' ? 'อนุมัติครู' : 'ไม่ผ่านการตรวจ'}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <SectionCard title="สถานะการตรวจสอบและการดำเนินการ">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">ยืนยันอีเมล:</span> <Badge variant={emailVerified ? 'success' : 'default'} size="sm" dot>{emailVerified ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}</Badge></div>
            <div><span className="text-slate-500">สถานะ KYC:</span> <Badge variant={teacher.kycStatus === 'verified' ? 'success' : teacher.kycStatus === 'pending' ? 'warning' : 'default'} size="sm" dot>{teacher.kycStatus || 'none'}</Badge></div>
            <div><span className="text-slate-500">ตรวจล่าสุด:</span> {formatTimestamp(teacher.adminReviewedAt)}</div>
            <div><span className="text-slate-500">ผู้ตรวจ:</span> <span className="font-mono text-xs">{teacher.adminReviewedBy || '—'}</span></div>
          </div>
          {teacher.adminReviewNote && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">หมายเหตุล่าสุด: {teacher.adminReviewNote}</p>
          )}
          <form action={reviewTeacher} className="mt-5 space-y-3">
            <input type="hidden" name="teacherId" value={id} />
            <label className="block text-sm font-medium text-slate-700" htmlFor="review-note">หมายเหตุการตรวจสอบ</label>
            <textarea id="review-note" name="note" rows={3} defaultValue={teacher.adminReviewNote || ''} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100" placeholder="ระบุเหตุผลหรือสิ่งที่ต้องติดตาม" />
            <div className="flex flex-wrap gap-2">
              {reviewStatus !== 'approved' && (
                <Button type="submit" name="decision" value="approved" variant="success" disabled={!teacher.idCardURL || !teacher.bookBankURL}>
                  อนุมัติครูหลังตรวจเอกสาร
                </Button>
              )}
              {reviewStatus !== 'rejected' && (
                <Button type="submit" name="decision" value="rejected" variant="outline" className="border-rose-300 text-rose-600">
                  ไม่ผ่านการตรวจ
                </Button>
              )}
            </div>
            {(!teacher.idCardURL || !teacher.bookBankURL) && reviewStatus !== 'approved' && (
              <p className="text-xs text-amber-700">ปุ่มอนุมัติจะเปิดเมื่อแนบเอกสารครบทั้ง 2 รายการ</p>
            )}
          </form>
        </SectionCard>

        <SectionCard title="ข้อมูลบัญชีและ KYC">
          <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">UID</dt><dd className="break-all font-mono text-xs text-slate-800">{teacher.uid}</dd></div>
            <div><dt className="text-slate-500">อีเมล</dt><dd className="break-all text-slate-800">{teacher.email || '—'}</dd></div>
            <div><dt className="text-slate-500">โทรศัพท์</dt><dd className="text-slate-800">{teacher.phone || '—'}</dd></div>
            <div><dt className="text-slate-500">สมัครเมื่อ</dt><dd className="text-slate-800">{formatTimestamp(teacher.createdAt)}</dd></div>
            <div><dt className="text-slate-500">ข้อตกลง</dt><dd className="text-slate-800">{teacher.termsVersion || '—'} • {formatTimestamp(teacher.consentAcceptedAt)}</dd></div>
            <div><dt className="text-slate-500">บัญชีรับเงิน</dt><dd className="text-slate-800">{teacher.payoutBankName || '—'} / {teacher.payoutAccountNumber ? `ลงท้าย ${teacher.payoutAccountNumber.slice(-4)}` : '—'}</dd></div>
          </dl>
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div><p className="font-semibold text-slate-800">บัตรประชาชน</p><p className="text-xs text-slate-500">{teacher.idCardURL ? 'มีเอกสารแนบ' : 'ยังไม่มีเอกสาร'}</p></div>
              {teacher.idCardURL ? <Link href={`/api/admin/teachers/${id}/documents/id-card`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:underline">เปิดดู <ExternalLink className="h-4 w-4" /></Link> : <FileText className="h-5 w-5 text-slate-300" />}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div><p className="font-semibold text-slate-800">สมุดบัญชีธนาคาร</p><p className="text-xs text-slate-500">{teacher.bookBankURL ? 'มีเอกสารแนบ' : 'ยังไม่มีเอกสาร'}</p></div>
              {teacher.bookBankURL ? <Link href={`/api/admin/teachers/${id}/documents/book-bank`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:underline">เปิดดู <ExternalLink className="h-4 w-4" /></Link> : <FileText className="h-5 w-5 text-slate-300" />}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`ประวัติการตรวจสอบ (${events.length} รายการ)`}>
          {events.length === 0 ? (
            <EmptyState icon={<History className="h-7 w-7" />} title="ยังไม่มีประวัติ Admin review" description="การตรวจสอบครั้งแรกจะแสดงที่นี่" />
          ) : (
            <div className="space-y-3">
              {events.map((event: any) => (
                <div key={event.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-pink-500" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-slate-800">{event.action === 'approved' ? 'อนุมัติครู' : 'ไม่ผ่านการตรวจ'}</p>
                    <p className="text-xs text-slate-500">{formatTimestamp(event.createdAt)} • Admin <span className="font-mono">{event.reviewerUid || '—'}</span></p>
                    {event.note && <p className="mt-1 text-slate-600">{event.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-100/60 bg-pink-50/40 p-3.5"
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

      <div className="mt-6">
        <SectionCard title={`ประวัติการจอง (${bookings.length} รายการ${bookings.length > 50 ? ' แสดงล่าสุด 50 รายการ' : ''})`}>
          {sortedBookings.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="ยังไม่มีประวัติการจอง" description="การจองที่ผูกกับครูคนนี้จะแสดงที่นี่" />
          ) : (
            <Table headers={['วันที่ / เวลา', 'คอร์ส', 'นักเรียน', 'ยอดรวม', 'สถานะ']}>
              {sortedBookings.map((booking: any) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <p className="font-semibold text-slate-800">{booking.bookingDate || '—'}</p>
                    <p className="text-xs text-slate-500">{booking.startTime || '—'}{booking.endTime ? `–${booking.endTime}` : ''}</p>
                  </TableCell>
                  <TableCell className="text-slate-700">{booking.courseTitle || '—'}</TableCell>
                  <TableCell className="text-slate-500">{booking.studentName || '—'}</TableCell>
                  <TableCell className="font-semibold text-slate-700">{typeof booking.totalPrice === 'number' ? formatCurrency(booking.totalPrice) : '—'}</TableCell>
                  <TableCell><BookingStatusBadge status={booking.status || 'pending'} /></TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
