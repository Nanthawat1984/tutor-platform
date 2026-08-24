import { getServerDb } from '@/lib/firebase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSessionUser } from '@/lib/auth/session';
import {
  BadgeCheck,
  BookOpen,
  Clock,
  GraduationCap,
  MessageSquare,
  Sparkles,
  Star,
  Users,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, VerificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { RatingStars } from '@/components/ui/rating';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { isTeacherAdminApproved } from '@/lib/auth/teacher-verification';

const TEACHING_STYLE_LABELS: Record<string, string> = {
  fun: 'เน้นสนุก',
  exam_focused: 'เน้นข้อสอบ',
  concept_based: 'เน้นความเข้าใจ',
};

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id } = await params;

  const [userSnap, teacherSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(id).get(),
    db.collection(COLLECTIONS.TEACHERS).doc(id).get(),
  ]);

  if (!userSnap.exists && !teacherSnap.exists) {
    return (
      <DashboardLayout title="โปรไฟล์ครู" navItems={PARENT_NAV_ITEMS} role="parent" userName={session.displayName || 'ผู้ปกครอง'}>
        <div className="py-16 text-center">
          <p className="text-slate-500">ไม่พบโปรไฟล์ครูนี้</p>
          <Link href="/explore" className="mt-2 inline-block text-sm font-semibold text-pink-600 hover:underline">
            กลับไปค้นหาครู
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const user = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } as any : null;
  const teacher = teacherSnap.exists ? { id: teacherSnap.id, ...teacherSnap.data() } as any : null;

  if (!user || !isTeacherAdminApproved(user)) notFound();

  const displayName = user?.displayName || teacher?.displayName || 'ครูพิเศษ';
  const photoURL = user?.photoURL || teacher?.photoURL;
  const totalStudents = teacher?.totalStudents ?? 0;
  const experienceYears = teacher?.experienceYears ?? 0;

  const [reviewsSnap, coursesSnap] = await Promise.all([
    db.collection(COLLECTIONS.REVIEWS)
      .where('teacherId', '==', id)
      .where('isVisible', '==', true)
      .get(),
    db.collection(COLLECTIONS.COURSES)
      .where('teacherId', '==', id)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get(),
  ]);

  // Sort reviews in JS (newest first) — avoids needing a composite Firestore index
  const reviews = reviewsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const courses = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // Real-time rating computed from ALL visible reviews (not the denormalized value)
  const totalReviews = reviews.length;
  const rating = totalReviews > 0
    ? Math.round((reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / totalReviews) * 10) / 10
    : 0;

  const ratingBreakdown = Array.from({ length: 5 }, (_, i) => {
    const star = 5 - i;
    const count = reviews.filter((r: any) => r.rating === star).length;
    return { star, count };
  });

  return (
    <DashboardLayout
      title="โปรไฟล์ครู"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      {/* ── Header Card ── */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 sm:h-28" />
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoURL}
                  alt={displayName}
                  className="h-20 w-20 shrink-0 rounded-2xl border-4 border-white bg-white object-cover shadow-elevated sm:h-24 sm:w-24"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-pink-100 to-rose-100 text-2xl font-extrabold text-pink-700 shadow-elevated sm:h-24 sm:w-24">
                  {getInitials(displayName)}
                </div>
              )}
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{displayName}</h1>
                  {user?.isVerified && <BadgeCheck className="h-5 w-5 text-sky-500" />}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <RatingStars rating={rating} showValue size="md" />
                  <span className="text-xs font-semibold text-slate-500">
                    {totalReviews > 0 ? `${totalReviews} รีวิว` : 'ยังไม่มีรีวิว'}
                  </span>
                  <VerificationBadge level={user?.verificationLevel || 'none'} />
                </div>
              </div>
            </div>

            {courses.length > 0 && (
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/bookings/new?course_id=${courses[0]?.id}`} className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto">
                    <Sparkles className="h-4 w-4" />
                    จองเรียน
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-lg">
            {[
              { icon: GraduationCap, label: 'ประสบการณ์', value: `${experienceYears} ปี` },
              { icon: Users, label: 'นักเรียน', value: totalStudents },
              { icon: Star, label: 'คะแนนเฉลี่ย', value: rating > 0 ? rating.toFixed(1) : '—' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl border border-pink-100/70 bg-pink-50/40 p-3 text-center">
                  <Icon className="mx-auto h-4 w-4 text-pink-500" />
                  <p className="mt-1.5 text-lg font-extrabold text-slate-900">{s.value}</p>
                  <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── About + Courses ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* About */}
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
              <BookOpen className="h-4 w-4" />
            </span>
            เกี่ยวกับครู
          </h2>

          <p className="mt-4 leading-relaxed text-slate-600">
            {teacher?.bio || 'ครูคนนี้ยังไม่ได้เขียนแนะนำตัวเอง'}
          </p>

          {teacher?.education && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-pink-400">การศึกษา</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{teacher.education}</p>
            </div>
          )}

          {teacher?.videoIntroURL && (
            <a
              href={teacher.videoIntroURL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2.5 text-sm font-bold text-pink-700 transition-colors hover:bg-pink-100"
            >
              <Video className="h-4 w-4" />
              ดูวิดีโอแนะนำตัว
            </a>
          )}

          {teacher?.teachingStyle && teacher.teachingStyle.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-pink-400">รูปแบบการสอน</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teacher.teachingStyle.map((style: string) => (
                  <Badge key={style} variant="primary">
                    {TEACHING_STYLE_LABELS[style] || style}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Courses */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
                <Clock className="h-4 w-4" />
              </span>
              คอร์สเรียน ({courses.length})
            </h2>
          </div>

          {courses.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">ครูคนนี้ยังไม่มีคอร์สเปิดสอน</p>
          ) : (
            <div className="mt-4 space-y-3">
              {courses.map((course: any) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-pink-100/70 bg-white/60 p-4 transition-all hover:bg-pink-50/50 hover:shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{course.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="info">{course.subjectName}</Badge>
                        <Badge variant="outline">ระดับ {course.level}</Badge>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-extrabold text-pink-700">{formatCurrency(course.pricePerSession)}</p>
                      <p className="text-[11px] text-slate-400">/เซสชัน • {course.durationMinutes} นาที</p>
                    </div>
                  </div>
                  <Link
                    href={`/bookings/new?course_id=${course.id}`}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-pink-600 hover:text-pink-800 hover:underline"
                  >
                    จองคอร์สนี้ →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Reviews ── */}
      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
            <MessageSquare className="h-4 w-4" />
          </span>
          รีวิวจากผู้ปกครอง ({totalReviews})
        </h2>

        {reviews.length === 0 ? (
          <div className="mt-6 rounded-xl border-2 border-dashed border-pink-200/60 bg-pink-50/30 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-600">ยังไม่มีรีวิว</p>
            <p className="mt-1 text-xs text-slate-400">รีวิวจะแสดงหลังผู้ปกครองเรียนจบและให้คะแนน</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            {/* Summary */}
            <div className="text-center lg:border-r lg:border-pink-100/60 lg:pr-6">
              <p className="text-5xl font-extrabold text-slate-900">{rating.toFixed(1)}</p>
              <RatingStars rating={rating} size="lg" className="mt-2 justify-center" />
              <p className="mt-1 text-xs text-slate-500">{totalReviews} รีวิว</p>

              <div className="mt-5 space-y-1.5">
                {ratingBreakdown.map((b) => (
                  <div key={b.star} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-6 shrink-0 text-right font-semibold">{b.star} ดาว</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${reviews.length ? (b.count / reviews.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-4 shrink-0 text-left">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* List — show 20 most recent, but summary counts all */}
            <div className="space-y-4">
              {reviews.slice(0, 20).map((review: any) => (
                <div key={review.id} className="rounded-xl border border-pink-100/60 bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                        {getInitials(review.parentName || 'ผู้ปกครอง')}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{review.parentName || 'ผู้ปกครอง'}</p>
                        <p className="text-[11px] text-slate-400">
                          {review.createdAt?.toDate ? formatDate(review.createdAt.toDate()) : ''}
                        </p>
                      </div>
                    </div>
                    <RatingStars rating={review.rating} size="sm" />
                  </div>
                  {review.comment && (
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{review.comment}</p>
                  )}
                </div>
              ))}
              {reviews.length > 20 && (
                <p className="pt-1 text-center text-xs font-semibold text-slate-400">
                  แสดง 20 จาก {reviews.length} รีวิว
                </p>
              )}
            </div>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
