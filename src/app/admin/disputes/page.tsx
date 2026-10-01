import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate, formatTime } from '@/lib/utils';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { BookingStatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { requireSessionUser } from '@/lib/auth/session';
import { resolveBookingDispute } from '@/lib/booking-actions';
import { AlertTriangle, CheckCircle2, Flag, Scale } from 'lucide-react';

// /admin/disputes — คิวข้อพิพาทของการจอง (disputeOpen == true)
// แอดมินอ่านสาเหตุจากทั้งสองฝ่าย (เห็นเฉพาะ reason/note ที่ถูกบันทึกไว้)
// แล้วกด "ปิดข้อพิพาท" เมื่อตัดสินแล้ว — ระบบแจ้งทั้งผู้ปกครองและครูให้ทราบ

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
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
  const showResolved = params.status === 'resolved';

  // single-field query — ไม่ต้องมี composite index
  const snap = showResolved
    ? await db.collection(COLLECTIONS.BOOKINGS).where('dispute.status', '==', 'resolved').limit(100).get()
    : await db.collection(COLLECTIONS.BOOKINGS).where('disputeOpen', '==', true).limit(100).get();

  const disputes = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.dispute?.createdAt?.toMillis ? a.dispute.createdAt.toMillis() : 0;
      const tb = b.dispute?.createdAt?.toMillis ? b.dispute.createdAt.toMillis() : 0;
      return tb - ta;
    });

  async function resolveDisputeAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const admin = await requireSessionUser();
    const adminDoc = await dbRef.collection(COLLECTIONS.USERS).doc(admin.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') return;

    const bookingId = String(formData.get('bookingId') || '');
    const note = String(formData.get('note') || '').slice(0, 500);
    if (!bookingId) return;
    await resolveBookingDispute(dbRef, { bookingId, note: note || undefined });
  }

  return (
    <DashboardLayout
      title="ข้อพิพาทการจอง"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'แอดมิน'}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-sm">
            <Scale className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              {showResolved ? 'ข้อพิพาทที่ปิดแล้ว' : 'รอตัดสิน'}
            </h2>
            <p className="text-xs text-slate-500">
              {showResolved
                ? 'ประวัติข้อพิพาทที่แอดมินตัดสินเรียบร้อย'
                : 'การจองที่ครูหรือผู้ปกครองเปิดข้อพิพาท — ระหว่างรอตัดสิน การเลื่อนคาบถูกระงับ'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href="/admin/disputes">
            <Button size="sm" variant={showResolved ? 'outline' : 'primary'}>
              รอตัดสิน
            </Button>
          </a>
          <a href="/admin/disputes?status=resolved">
            <Button size="sm" variant={showResolved ? 'primary' : 'outline'}>
              ปิดแล้ว
            </Button>
          </a>
        </div>
      </div>

      {params.error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ เกิดข้อผิดพลาด: {params.error}
        </p>
      )}

      {disputes.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-7 w-7" />}
          title={showResolved ? 'ยังไม่มีประวัติข้อพิพาท' : 'ไม่มีข้อพิพาทรอตัดสิน 🎉'}
          description={showResolved ? 'ข้อพิพาทที่ปิดแล้วจะแสดงที่นี่' : 'ทุกการจองเรียบร้อยดี'}
        />
      ) : (
        <div className="space-y-4">
          {disputes.map((b: any) => {
            const dispute = b.dispute || {};
            return (
              <Card key={b.id} className={showResolved ? 'opacity-80' : 'border-rose-200'}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pink-100 pb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">{b.courseTitle || 'คอร์สเรียน'}</h3>
                      <BookingStatusBadge status={b.status} />
                      {!showResolved && <Badge variant="danger" dot>เปิดข้อพิพาท</Badge>}
                      {b.lateReschedule === true && <Badge variant="warning" size="sm" dot>เลื่อนสาย</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      นักเรียน: {b.studentName || '-'} • ครู: {b.teacherName || '-'} • ผู้ปกครอง: {b.parentName || '-'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      เซสชัน: {formatDate(b.bookingDate, 'd MMMM yyyy')} {formatTime(b.startTime)} - {formatTime(b.endTime)} น.
                      {' '}• รหัสจอง: <span className="font-mono">{b.id}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                      <Flag className="h-3.5 w-3.5" /> สาเหตุ
                    </p>
                    <p className="mt-1 font-semibold text-slate-800">{dispute.reason || '-'}</p>
                    {dispute.note && <p className="mt-1 text-xs text-slate-600">รายละเอียด: {dispute.note}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      โดย: {dispute.filedBy === 'parent' ? 'ผู้ปกครอง' : dispute.filedBy === 'teacher' ? 'ครู' : '-'}
                      {dispute.createdAt?.toDate
                        ? ` • ${formatDate(dispute.createdAt.toDate().toISOString().slice(0, 10), 'd MMM yyyy')}`
                        : ''}
                    </p>
                  </div>

                  {!showResolved && (
                    <form action={resolveDisputeAction} className="space-y-2">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Textarea
                        label="บันทึกการตัดสิน (ส่งให้ทั้งสองฝ่าย)"
                        name="note"
                        placeholder="เช่น ตรวจสอบแล้วตัดสินให้ฝั่งผู้ปกครอง คืนเครดิตเรียบร้อย"
                        className="min-h-[72px]"
                      />
                      <Button type="submit" size="sm" variant="success" className="w-full sm:w-auto">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        ปิดข้อพิพาทและแจ้งทั้งสองฝ่าย
                      </Button>
                    </form>
                  )}

                  {showResolved && dispute.resolvedAt?.toDate && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-slate-600">
                      <p className="font-bold text-emerald-700">ปิดข้อพิพาทแล้ว</p>
                      <p className="mt-1">
                        {formatDate(dispute.resolvedAt.toDate().toISOString().slice(0, 10), 'd MMM yyyy')}
                      </p>
                    </div>
                  )}
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
