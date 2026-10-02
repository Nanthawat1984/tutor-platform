import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MessageSquareQuote, Star, Reply, ShieldOff } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate, getInitials } from '@/lib/utils';
import { DashboardLayout, EmptyState, StatCard, SectionCard } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RatingStars } from '@/components/ui/rating';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';

// /reviews — รีวิวของครูเอง (ดูทั้งหมด/ตอบกลับ)
// หมายเหตุ: รีวิวที่ถูกแอดมินซ่อน (isVisible=false) ยังแสดงให้ครูเห็น
// พร้อมป้ายกำกับ เพื่อให้ครูรู้ว่ามีรีวิวตัวเองอยู่ แต่ไม่ได้ขึ้นโปรไฟล์สาธารณะ

const FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'with_comment', label: 'มีความคิดเห็น' },
  { value: 'unreplied', label: 'ยังไม่ตอบกลับ' },
  { value: 'hidden', label: 'ถูกซ่อนโดยแอดมิน' },
] as const;

const MAX_REPLY_LENGTH = 500;

export default async function TeacherReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; replied?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.filter) ? params.filter! : '';

  // single-field query — เรียงใน JS เพื่อไม่ต้องมี composite index
  const snap = await db.collection(COLLECTIONS.REVIEWS)
    .where('teacherId', '==', teacherId)
    .limit(200)
    .get();
  const all = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  const reviews = all.filter((r: any) => {
    if (filter === 'with_comment') return Boolean(r.comment);
    if (filter === 'unreplied') return !r.reply;
    if (filter === 'hidden') return r.isVisible === false;
    return true;
  });

  // เติมบริบท (ชื่อผู้ปกครอง/นักเรียน/คอร์ส) — รีวิวเก่าอาจไม่มี denormalized fields
  const parentIds = Array.from(new Set(all.map((r: any) => r.parentId).filter(Boolean)));
  const bookingIds = Array.from(new Set(all.map((r: any) => r.bookingId).filter(Boolean)));
  const parentNames = new Map<string, string>();
  if (parentIds.length) {
    const parentSnaps = await db.getAll(...parentIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id)));
    parentSnaps.forEach((s) => {
      if (s.exists) parentNames.set(s.id, (s.data() as any)?.displayName || 'ผู้ปกครอง');
    });
  }
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

  const visible = all.filter((r: any) => r.isVisible === true);
  const average = visible.length > 0
    ? Math.round((visible.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / visible.length) * 10) / 10
    : 0;
  const withComment = all.filter((r: any) => Boolean(r.comment)).length;
  const replied = all.filter((r: any) => Boolean(r.reply)).length;
  const hiddenCount = all.length - visible.length;
  const breakdown = Array.from({ length: 5 }, (_, i) => {
    const star = 5 - i;
    return { star, count: all.filter((r: any) => Number(r.rating) === star).length };
  });

  async function replyAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;

    const reviewId = String(formData.get('reviewId') || '');
    const reply = String(formData.get('reply') || '').trim().slice(0, MAX_REPLY_LENGTH);
    if (!reviewId) return;

    const reviewSnap = await dbRef.collection(COLLECTIONS.REVIEWS).doc(reviewId).get();
    // เช็คเจ้าของรีวิวทุกครั้ง — ห้ามตอบรีวิวของครูคนอื่น
    if (!reviewSnap.exists || (reviewSnap.data() as any)?.teacherId !== current.uid) return;

    await dbRef.collection(COLLECTIONS.REVIEWS).doc(reviewId).update({
      reply: reply || null,
      repliedAt: reply ? new Date() : null,
      updatedAt: new Date(),
    });
  }

  return (
    <DashboardLayout
      title="รีวิวของฉัน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      {params.replied === '1' && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          บันทึกคำตอบกลับเรียบร้อยแล้ว
        </div>
      )}

      {/* ── Stats ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="คะแนนเฉลี่ย"
          value={average > 0 ? average.toFixed(1) : '—'}
          icon={<Star className="h-6 w-6" />}
          iconGradient="from-amber-500 to-orange-500"
          subtext={`จากรีวิวที่แสดงอยู่ ${visible.length} รายการ`}
        />
        <StatCard
          label="รีวิวทั้งหมด"
          value={all.length}
          icon={<MessageSquareQuote className="h-6 w-6" />}
          iconGradient="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="มีความคิดเห็น"
          value={withComment}
          icon={<Reply className="h-6 w-6" />}
          iconGradient="from-indigo-500 to-blue-600"
          subtext={all.length > 0 ? `${Math.round((withComment / all.length) * 100)}% ของทั้งหมด` : undefined}
        />
        <StatCard
          label="ตอบกลับแล้ว"
          value={replied}
          icon={<ShieldOff className="h-6 w-6" />}
          iconGradient="from-pink-500 to-rose-600"
          subtext={hiddenCount > 0 ? `ถูกซ่อนโดยแอดมิน ${hiddenCount} รายการ` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {/* ── Filters ── */}
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value ? `/reviews?filter=${f.value}` : '/reviews'}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  filter === f.value
                    ? 'bg-pink-600 text-white'
                    : 'border border-pink-100 bg-white text-slate-600 hover:bg-pink-50'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {reviews.length === 0 ? (
            <EmptyState
              icon={<MessageSquareQuote className="h-7 w-7" />}
              title={all.length === 0 ? 'ยังไม่มีรีวิว' : 'ไม่มีรีวิวในตัวกรองนี้'}
              description={
                all.length === 0
                  ? 'รีวิวจากผู้ปกครองจะแสดงที่นี่หลังเรียนจบและให้คะแนน'
                  : 'ลองเลือกตัวกรองอื่น'
              }
            />
          ) : (
            <div className="space-y-4">
              {reviews.map((r: any) => {
                const ctx = r.bookingId ? bookingContext.get(r.bookingId) : undefined;
                const parentName = r.parentId ? parentNames.get(r.parentId) || 'ผู้ปกครอง' : 'ผู้ปกครอง';
                return (
                  <Card key={r.id} className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-700">
                          {getInitials(ctx?.studentName || parentName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">
                            {ctx?.studentName || 'นักเรียน'}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {ctx?.courseTitle || 'คอร์สเรียน'} • {parentName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {r.createdAt?.toDate ? formatDate(r.createdAt.toDate(), 'd MMM yyyy') : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <RatingStars rating={Number(r.rating) || 0} size="sm" showValue />
                        {r.isVisible === false && <Badge variant="warning" size="sm">ซ่อนจากโปรไฟล์</Badge>}
                      </div>
                    </div>

                    {r.comment ? (
                      <p className="rounded-xl bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-700">
                        {r.comment}
                      </p>
                    ) : (
                      <p className="text-xs italic text-slate-400">ผู้ปกครองให้คะแนนโดยไม่ได้เขียนความคิดเห็น</p>
                    )}

                    {r.reply && (
                      <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-3">
                        <p className="text-[11px] font-bold text-pink-700">คุณตอบกลับแล้ว</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">{r.reply}</p>
                      </div>
                    )}

                    <form action={replyAction} className="space-y-2">
                      <input type="hidden" name="reviewId" value={r.id} />
                      <textarea
                        name="reply"
                        rows={2}
                        defaultValue={r.reply || ''}
                        maxLength={MAX_REPLY_LENGTH}
                        placeholder="ตอบกลับผู้ปกครอง (แสดงบนโปรไฟล์สาธารณะของคุณ)"
                        className="w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                      />
                      <div className="flex justify-end gap-2">
                        {r.reply && (
                          <Button type="submit" variant="ghost" size="sm">ลบคำตอบ</Button>
                        )}
                        <Button type="submit" size="sm">บันทึกคำตอบ</Button>
                      </div>
                    </form>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Breakdown ── */}
        <div className="h-fit">
        <SectionCard title="การกระจายคะแนน">
          {all.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2">
              {breakdown.map((b) => (
                <div key={b.star} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-8 shrink-0 text-right font-semibold">{b.star} ดาว</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${all.length ? (b.count / all.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-4 shrink-0 text-left">{b.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';