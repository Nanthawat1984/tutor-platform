import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleDollarSign, FileCheck2, FileWarning, LockKeyhole, Search, Wallet } from 'lucide-react';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardLayout, EmptyState, SectionCard, StatCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { AttendanceStatusBadge, Badge, BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import {
  buildReconciliationRows,
  summarizeReconciliationRows,
  type ReconciliationAttendance,
  type ReconciliationBooking,
  type ReconciliationPayment,
  type ReconciliationPayout,
  type ReconciliationPaymentStatus,
  type ReconciliationRow,
} from '@/lib/admin/reconciliation';

interface ReconciliationPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

const paymentFilters = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unpaid', label: 'ยังไม่จ่าย' },
  { value: 'awaiting_review', label: 'รอตรวจสลิป' },
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'escrow_pending', label: 'รอปล่อย escrow' },
  { value: 'escrow_released', label: 'ปล่อยเข้า wallet แล้ว' },
];

const payoutLabels: Record<string, { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger' }> = {
  none: { label: 'ยังไม่มีรอบเบิก', variant: 'default' },
  requested: { label: 'รอดำเนินการ', variant: 'warning' },
  processing: { label: 'กำลังโอน', variant: 'info' },
  paid: { label: 'โอนแล้ว', variant: 'success' },
  rejected: { label: 'ปฏิเสธ', variant: 'danger' },
};

function toMillis(value: any): number | undefined {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return undefined;
}

function PaymentStateBadge({ status }: { status: ReconciliationPaymentStatus }) {
  if (status === 'missing') return <Badge variant="default" dot>ไม่มีรายการชำระ</Badge>;
  return <PaymentStatusBadge status={status} />;
}

function EscrowBadge({ status }: { status: ReconciliationRow['escrowStatus'] }) {
  const config = {
    not_paid: { label: 'ยังไม่เข้า escrow', variant: 'default' as const },
    pending: { label: 'รอเรียน/รอปล่อย', variant: 'warning' as const },
    released: { label: 'ปล่อยเข้า wallet แล้ว', variant: 'success' as const },
  }[status];
  return <Badge variant={config.variant} dot>{config.label}</Badge>;
}

function matchesFilter(row: ReconciliationRow, status: string): boolean {
  if (!status || status === 'all') return true;
  if (status === 'unpaid') return row.paymentStatus === 'missing' || row.paymentStatus === 'pending';
  if (status === 'escrow_pending') return row.escrowStatus === 'pending';
  if (status === 'escrow_released') return row.escrowStatus === 'released';
  return row.paymentStatus === status;
}

function rowMatchesQuery(row: ReconciliationRow, query: string): boolean {
  if (!query) return true;
  return [
    row.bookingId,
    row.paymentId || '',
    row.studentName,
    row.teacherName,
    row.courseTitle,
  ].some((value) => value.toLowerCase().includes(query));
}

export default async function AdminReconciliationPage({ searchParams }: ReconciliationPageProps) {
  const { db, session } = await requireAdmin();
  const params = await searchParams;
  const query = String(params.q || '').trim().toLowerCase();
  const statusFilter = params.status || 'all';

  const [bookingsSnap, paymentsSnap, attendanceSnap, payoutsSnap, walletsSnap] = await Promise.all([
    db.collection(COLLECTIONS.BOOKINGS).limit(500).get(),
    db.collection(COLLECTIONS.PAYMENTS).limit(500).get(),
    db.collection(COLLECTIONS.ATTENDANCE).limit(500).get(),
    db.collection(COLLECTIONS.PAYOUTS).limit(200).get(),
    db.collection(COLLECTIONS.WALLETS).limit(200).get(),
  ]);

  const bookings: ReconciliationBooking[] = bookingsSnap.docs
    .map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        teacherId: String(data.teacherId || ''),
        teacherName: String(data.teacherName || '-'),
        studentName: String(data.studentName || '-'),
        courseTitle: String(data.courseTitle || '-'),
        bookingDate: String(data.bookingDate || ''),
        startTime: String(data.startTime || ''),
        endTime: String(data.endTime || ''),
        status: String(data.status || 'pending'),
        totalPrice: Number(data.totalPrice) || 0,
      } satisfies ReconciliationBooking;
    })
    .sort((a, b) => `${b.bookingDate}|${b.startTime}`.localeCompare(`${a.bookingDate}|${a.startTime}`));

  const payments: ReconciliationPayment[] = paymentsSnap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      bookingId: String(data.bookingId || ''),
      teacherId: data.teacherId ? String(data.teacherId) : undefined,
      status: String(data.status || 'pending'),
      method: data.method ? String(data.method) : undefined,
      amount: Number(data.amount) || 0,
      paidAtMillis: toMillis(data.paidAt),
      createdAtMillis: toMillis(data.createdAt),
      payoutAmount: data.payoutAmount === undefined ? undefined : Number(data.payoutAmount) || 0,
      taxWithheldAtMillis: toMillis(data.taxWithheldAt),
    };
  });

  const attendance: ReconciliationAttendance[] = attendanceSnap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      bookingId: String(data.bookingId || ''),
      status: String(data.status || 'pending'),
      updatedAtMillis: toMillis(data.updatedAt),
      createdAtMillis: toMillis(data.createdAt),
    };
  });

  const payouts: ReconciliationPayout[] = payoutsSnap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      teacherId: String(data.teacherId || ''),
      status: String(data.status || 'requested'),
      amount: Number(data.amount) || 0,
      createdAtMillis: toMillis(data.createdAt),
    };
  });

  const rows = buildReconciliationRows({ bookings, payments, attendance, payouts });
  const filteredRows = rows.filter((row) => matchesFilter(row, statusFilter) && rowMatchesQuery(row, query));
  const summary = summarizeReconciliationRows(filteredRows);

  const walletByTeacher = new Map<string, { pendingBalance: number; availableBalance: number }>();
  walletsSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    walletByTeacher.set(doc.id, {
      pendingBalance: Number(data.pendingBalance) || 0,
      availableBalance: Number(data.availableBalance) || 0,
    });
  });

  const payoutByTeacher = new Map<string, ReconciliationPayout>();
  for (const payout of payouts) {
    const current = payoutByTeacher.get(payout.teacherId);
    if (!current || (payout.createdAtMillis || 0) >= (current.createdAtMillis || 0)) {
      payoutByTeacher.set(payout.teacherId, payout);
    }
  }
  const teacherIds = [...new Set(filteredRows.map((row) => row.teacherId).filter(Boolean))];
  const teacherSummaries = teacherIds.map((teacherId) => {
    const firstRow = filteredRows.find((row) => row.teacherId === teacherId);
    const wallet = walletByTeacher.get(teacherId) || { pendingBalance: 0, availableBalance: 0 };
    const payout = payoutByTeacher.get(teacherId);
    return {
      teacherId,
      teacherName: firstRow?.teacherName || '-',
      pendingBalance: wallet.pendingBalance,
      availableBalance: wallet.availableBalance,
      payoutStatus: payout?.status || 'none',
    };
  });

  return (
    <DashboardLayout title="กระทบยอดการชำระเงิน" navItems={ADMIN_NAV_ITEMS} role="admin" userName={session.displayName || 'Admin'}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">ตรวจว่าเด็กคนไหนจ่ายแล้ว เงินอยู่ขั้นตอนไหน และครูมีเงินรอโอนเท่าไร</p>
          <p className="mt-1 text-xs text-amber-700">สถานะ “โอนครูแล้ว” เป็นระดับรอบเบิกของครู ไม่ได้ผูกกับเด็กคนเดียว</p>
        </div>
        <div className="flex gap-3 text-sm font-semibold">
          <Link href="/admin/payments" className="text-pink-600 hover:underline">ตรวจสลิป</Link>
          <Link href="/admin/payouts" className="text-pink-600 hover:underline">จัดการรอบโอน</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="รายการทั้งหมด" value={summary.total} icon={<Search className="h-6 w-6" />} iconGradient="from-indigo-500 to-blue-600" />
        <StatCard label="ชำระแล้ว" value={summary.paid} icon={<FileCheck2 className="h-6 w-6" />} iconGradient="from-emerald-500 to-teal-600" />
        <StatCard label="รอตรวจสลิป" value={summary.awaitingReview} icon={<FileWarning className="h-6 w-6" />} iconGradient="from-amber-500 to-orange-500" />
        <StatCard label="ยังไม่ชำระ" value={summary.unpaid} icon={<CircleDollarSign className="h-6 w-6" />} iconGradient="from-rose-500 to-red-600" />
        <StatCard label="รอปล่อย escrow" value={summary.escrowPending} icon={<LockKeyhole className="h-6 w-6" />} iconGradient="from-sky-500 to-cyan-600" />
      </div>

      <form method="get" className="mb-6 grid gap-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto] md:items-end">
        <div>
          <label htmlFor="reconciliation-query" className="mb-1.5 block text-sm font-semibold text-slate-700">ค้นหาเด็ก/ครู/รหัสรายการ</label>
          <input id="reconciliation-query" name="q" defaultValue={params.q || ''} placeholder="เช่น น้องปั้น หรือ booking ID" className="min-h-[44px] w-full rounded-xl border border-pink-100 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" />
        </div>
        <div>
          <label htmlFor="reconciliation-status" className="mb-1.5 block text-sm font-semibold text-slate-700">สถานะ</label>
          <select id="reconciliation-status" name="status" defaultValue={statusFilter} className="min-h-[44px] w-full rounded-xl border border-pink-100 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100">
            {paymentFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </div>
        <button type="submit" className="min-h-[44px] rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-pink-700">ค้นหา</button>
      </form>

      <SectionCard title={`รายการรายเด็ก (${filteredRows.length})`}>
        {filteredRows.length === 0 ? (
          <EmptyState icon={<Wallet className="h-7 w-7" />} title="ไม่พบรายการ" description="ลองเปลี่ยนคำค้นหาหรือสถานะที่เลือก" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-3 font-semibold">นักเรียน / คอร์ส</th>
                  <th className="px-3 py-3 font-semibold">ครู / วันเรียน</th>
                  <th className="px-3 py-3 font-semibold">ยอด</th>
                  <th className="px-3 py-3 font-semibold">การชำระ</th>
                  <th className="px-3 py-3 font-semibold">การเข้าเรียน</th>
                  <th className="px-3 py-3 font-semibold">Escrow</th>
                  <th className="px-3 py-3 font-semibold">รอบโอนครูล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.bookingId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4 align-top">
                      <p className="font-bold text-slate-900">{row.studentName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.courseTitle}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Booking: {row.bookingId}</p>
                    </td>
                    <td className="px-3 py-4 align-top">
                      <p className="font-semibold text-slate-700">{row.teacherName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.bookingDate} • {row.startTime}-{row.endTime}</p>
                      <div className="mt-2"><BookingStatusBadge status={row.bookingStatus} /></div>
                    </td>
                    <td className="px-3 py-4 align-top">
                      <p className="font-bold text-slate-900">{formatCurrency(row.paymentAmount)}</p>
                      {row.paymentId && <p className="mt-1 text-[11px] text-slate-400">Payment: {row.paymentId}</p>}
                    </td>
                    <td className="px-3 py-4 align-top">
                      <PaymentStateBadge status={row.paymentStatus} />
                      {row.paymentMethod && <p className="mt-1 text-xs text-slate-500">{row.paymentMethod}</p>}
                      {row.paidAtMillis && <p className="mt-1 text-[11px] text-emerald-700">{formatDate(new Date(row.paidAtMillis), 'd MMM yyyy HH:mm')}</p>}
                    </td>
                    <td className="px-3 py-4 align-top"><AttendanceStatusBadge status={row.attendanceStatus} /></td>
                    <td className="px-3 py-4 align-top"><EscrowBadge status={row.escrowStatus} /></td>
                    <td className="px-3 py-4 align-top">
                      {(() => {
                        const payout = payoutLabels[row.latestTeacherPayoutStatus] || payoutLabels.none;
                        return <Badge variant={payout.variant} dot>{payout.label}</Badge>;
                      })()}
                      <p className="mt-1 text-[11px] text-slate-400">ดูรายละเอียดรอบโอนของครูแยกต่างหาก</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="กระเป๋าเงินและรอบโอนของครูที่เกี่ยวข้อง">
          {teacherSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มีข้อมูลครูในรายการที่แสดง</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-3">ครู</th><th className="px-3 py-3">รอปล่อย escrow</th><th className="px-3 py-3">พร้อมโอน</th><th className="px-3 py-3">รอบโอนล่าสุด</th></tr></thead>
                <tbody>
                  {teacherSummaries.map((teacher) => {
                    const payout = payoutLabels[teacher.payoutStatus] || payoutLabels.none;
                    return <tr key={teacher.teacherId} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-semibold text-slate-800">{teacher.teacherName}</td><td className="px-3 py-3 text-amber-700">{formatCurrency(teacher.pendingBalance)}</td><td className="px-3 py-3 text-emerald-700">{formatCurrency(teacher.availableBalance)}</td><td className="px-3 py-3"><Badge variant={payout.variant} dot>{payout.label}</Badge></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <p className="mt-4 text-xs text-slate-400">แสดงข้อมูลล่าสุดไม่เกิน 500 bookings/payments และ 200 payouts/wallets เพื่อควบคุมค่าอ่าน Firestore</p>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
