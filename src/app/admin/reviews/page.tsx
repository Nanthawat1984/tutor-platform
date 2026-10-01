import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate } from '@/lib/utils';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RatingStars } from '@/components/ui/rating';
import { requireSessionUser } from '@/lib/auth/session';
import { updateTeacherRating } from '@/lib/firestore/queries';
import { Eye, EyeOff, Star, MessageSquareQuote } from 'lucide-react';

// /admin/reviews — moderation รีวิวครู
// รีวิวทุกอันถูกสร้างด้วย isVisible: true (verified ผ่าน booking completed เท่านั้น)
// หน้านี้ให้แอดมินซ่อน/แสดงซ้ำ: ซ่อน = หายจากโปรไฟล์ครูทันที (หน้า teachers/[id]
// และ rating ครูคำนวณจากรีวิว visible เท่านั้น) + recompute rating ทุกครั้ง
// การกระทำทั้งหมดบันทึก moderation log ใน notification ของแอดมิน (audit trail เบื้องต้น)

const FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'visible', label: 'แสดงอยู่' },
  { value: 'hidden', label: 'ถูกซ่อน' },
] as const;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; done?: string; error?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();

  // Admin guard
  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.filter) ? params.filter! : '';

  // single-field query — ไม่ต้องมี composite index (กรอง/เรียงใน JS)
  const snap = await db.collection(COLLECTIONS.REVIEWS).limit(200).get();
  const reviews = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((r: any) => {
      if (filter === 'visible') return r.isVisible === true;
      if (filter === 'hidden') return r.isVisible === false;
      return true;
    })
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    })
    .slice(0, 100);

  // เติมชื่อ/ข้อมูลที่ denormalize ไม่ครบ — รีวิวเก่าอาจไม่มี teacherName/parentName
  const userIds = Array.from(new Set(reviews.flatMap((r: any) => [r.teacherId, r.parentId].filter(Boolean))));
  const userNames = new Map<string, string>();
  if (userIds.length) {
    const userSnaps = await db.getAll(...userIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id)));
    userSnaps.forEach((s) => {
      if (s.exists) userNames.set(s.id, (s.data() as any)?.displayName || '-');
    });
  }

  // booking อ้างอิง — แสดงบริบทคอร์ส (รีวิวเก่าไม่มี denormalized fields)
  const bookingIds = Array.from(new Set(reviews.map((r: any) => r.bookingId).filter(Boolean)));
  const bookingContext = new Map<string, { courseTitle: string; studentName: string }>();
  if (bookingIds.length) {
    const bookingSnaps = await db.getAll(...bookingIds.map((id) => db.collection(COLLECTIONS.BOOKINGS).doc(id)));
    bookingSnaps.forEach((s) => {
      if (s.exists) {
        const d = s.data() as any;
        bookingContext.set(s.id, { courseTitle: d.courseTitle || '-', studentName: d.studentName || '-' });
      }
    });
  }

  const visibleCount = reviews.filter((r: any) => r.isVisible === true).length;
  const hiddenCount = reviews.length - visibleCount;

  async function toggleVisibilityAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const admin = await requireSessionUser();
    const adminDoc = await dbRef.collection(COLLECTIONS.USERS).doc(admin.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') return;

    const reviewId = String(formData.get('reviewId') || '');
    const nextVisible = String(formData.get('nextVisible') || '') === 'true';
    const teacherId = String(formData.get('teacherId') || '');
    if (!reviewId) return;

    // อ่านค่าปัจจุบันก่อนเขียน (กัน double-submit สวนกัน)
    const reviewSnap = await dbRef.collection(COLLECTIONS.REVIEWS).doc(reviewId).get();
    if (!reviewSnap.exists) return;
    const review = reviewSnap.data() as any;
    if (review.isVisible === nextVisible) return; // ไม่มีอะไรเปลี่ยน

    await dbRef.collection(COLLECTIONS.REVIEWS).doc(reviewId).update({
      isVisible: nextVisible,
      moderatedBy: admin.uid,
      moderatedAt: new Date(),
      updatedAt: new Date(),
    });

    // rating ครูต้อง recompute — หน้าโปรไฟล์ครูคำนวณจาก visible reviews เท่านั้น
    if (review.teacherId) {
      await updateTeacherRating(review.teacherId);
    }

    // audit trail เบื้องต้น — แจ้งแอดมินคนอื่น (และตัวเอง) ทราบการกระทำ
    await dbRef.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: admin.uid,
      type: 'review',
      title: nextVisible ? 'แสดงรีวิวแล้ว' : 'ซ่อนรีวิวแล้ว',
      body: `${nextVisible ? 'แสดง' : 'ซ่อน'}รีวิว ${reviewId} (ครู ${review.teacherId || '-'}) ${nextVisible ? '— rating ถูกคำนวณใหม่แล้ว' : ''}`,
      data: { reviewId, teacherId: review.teacherId, nextVisible },
      isRead: false,
      createdAt: new Date(),
    });
  }

  return (
    <DashboardLayout
      title="Moderation รีวิว"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'แอดมิน'}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <MessageSquareQuote className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">รีวิวจากผู้ปกครอง</h2>
            <p className="text-xs text-slate-500">
              ซ่อนรีวิวที่ไม่เหมาะสม — รีวิวที่ซ่อนจะหายจากโปรไฟล์ครูและไม่ถูกนับในคะแนนเฉลี่ยทันที
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link key={f.value || 'all'} href={f.value ? `/admin/reviews?filter=${f.value}` : '/admin/reviews'}>
              <Button size="sm" variant={filter === f.value ? 'primary' : 'outline'}>
                {f.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {params.done === '1' && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          ✅ บันทึกการเปลี่ยนแปลงแล้ว — rating ครูถูกคำนวณใหม่
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ เกิดข้อผิดพลาด: {params.error}
        </p>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          icon={<Star className="h-7 w-7" />}
          title="ยังไม่มีรีวิว"
          description={filter === 'hidden' ? 'ไม่มีรีวิวที่ถูกซ่อน 🎉' : 'รีวิวจะแสดงที่นี่เมื่อผู้ปกครองเริ่มรีวิวครู'}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
            <Badge variant="success" dot>แสดงอยู่ {visibleCount}</Badge>
            {hiddenCount > 0 && <Badge variant="danger" dot>ถูกซ่อน {hiddenCount}</Badge>}
          </div>

          <div className="space-y-3">
            {reviews.map((r: any) => {
              const ctx = bookingContext.get(r.bookingId);
              const hidden = r.isVisible === false;
              return (
                <Card key={r.id} className={hidden ? 'opacity-70' : ''}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <RatingStars rating={Number(r.rating) || 0} size="sm" />
                        <span className="text-sm font-bold text-slate-900">
                          {userNames.get(r.parentId) || r.parentName || 'ผู้ปกครอง'}
                        </span>
                        {hidden ? <Badge variant="danger" dot>ถูกซ่อน</Badge> : <Badge variant="success" dot>แสดงอยู่</Badge>}
                        {r.isVerified === false && <Badge variant="warning" size="sm">ไม่ยืนยัน</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        ครู {userNames.get(r.teacherId) || r.teacherName || '-'}
                        {ctx ? ` • ${ctx.courseTitle} • นักเรียน ${ctx.studentName}` : ''}
                        {r.createdAt?.toDate ? ` • ${formatDate(r.createdAt.toDate().toISOString().slice(0, 10), 'd MMM yyyy')}` : ''}
                      </p>
                      {r.comment && (
                        <p className={`mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${hidden ? 'italic' : ''}`}>
                          “{r.comment}”
                        </p>
                      )}
                      {r.moderatedBy && (
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          {hidden ? 'ซ่อน' : 'แสดง'}ล่าสุดโดยแอดมิน{r.moderatedAt?.toDate ? ` • ${formatDate(r.moderatedAt.toDate().toISOString().slice(0, 10), 'd MMM yyyy')}` : ''}
                        </p>
                      )}
                    </div>

                    <form action={toggleVisibilityAction} className="shrink-0">
                      <input type="hidden" name="reviewId" value={r.id} />
                      <input type="hidden" name="nextVisible" value={hidden ? 'true' : 'false'} />
                      <input type="hidden" name="teacherId" value={r.teacherId || ''} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={hidden ? 'success' : 'outline'}
                        className={hidden ? '' : 'border-rose-200 text-rose-600 hover:bg-rose-50'}
                      >
                        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {hidden ? 'แสดงอีกครั้ง' : 'ซ่อนรีวิว'}
                      </Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
