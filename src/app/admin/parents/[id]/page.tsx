import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { COLLECTIONS, type Booking, type Payment, type Student, type User } from '@/types/firestore';
import { requireAdmin } from '@/lib/auth/guards';
import { summarizeParentActivity } from '@/lib/admin/parent-detail';
import { Badge, BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/badge';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { DashboardLayout, EmptyState, SectionCard, StatCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { ArrowLeft, CalendarDays, CreditCard, GraduationCap, History, MailCheck, Phone, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { creditParentWallet, debitParentWallet } from '@/lib/parent-wallet';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe_checkout: 'Stripe Checkout',
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  truemoney: 'TrueMoney',
  bank_transfer: 'โอนเงิน',
};

function formatTimestamp(value: unknown): string {
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleString('th-TH') : '—';
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;
  return typeof (value as { toMillis?: () => number }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'object' && value !== null && 'seconds' in value
      ? Number((value as { seconds: number }).seconds) * 1000
      : 0;
}

function sortByDateDesc(items: any[], getKey: (item: any) => string): any[] {
  return [...items].sort((a, b) => getKey(b).localeCompare(getKey(a)));
}

interface ParentDetailProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ adjusted?: string; adjust_error?: string }>;
}

const WALLET_TX_LABELS: Record<string, string> = {
  refund: 'เงินคืนจากการยกเลิก/ตัดสินข้อพิพาท',
  spend: 'ใช้ชำระค่าเรียน',
  reversal: 'ปรับยอดย้อนหลัง',
  adjust: 'ปรับยอดโดยแอดมิน',
};

export default async function AdminParentDetailPage({ params, searchParams }: ParentDetailProps) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const query = (await searchParams) || {};

  const [parentSnap, studentsSnap, bookingsSnap, paymentsSnap, walletSnap, walletTxsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(id).get(),
    db.collection(COLLECTIONS.STUDENTS).where('parentId', '==', id).get(),
    db.collection(COLLECTIONS.BOOKINGS).where('parentId', '==', id).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('parentId', '==', id).get(),
    db.collection(COLLECTIONS.PARENT_WALLETS).doc(id).get(),
    db.collection(COLLECTIONS.PARENT_WALLET_TXS).where('parentId', '==', id).limit(50).get(),
  ]);

  if (!parentSnap.exists || parentSnap.data()?.role !== 'parent') notFound();

  const parent = { uid: id, ...(parentSnap.data() as any) } as User;
  const students = studentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Student));
  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Booking));
  const payments = paymentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Payment));
  const wallet = walletSnap.exists
    ? (walletSnap.data() as any)
    : { balance: 0, totalCredited: 0, totalSpent: 0 };
  const walletBalance = Number(wallet.balance) || 0;
  const walletTxs = [...walletTxsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))]
    .sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
    .slice(0, 10);

  // ── ปรับยอดเครดิตวอลเล็ต (แอดมินเท่านั้น) ──
  // ทุกครั้งเขียน ledger แบบ adjust ผ่าน parent-wallet.ts → ยอดไม่หลุดและตรวจสอบย้อนหลังได้
  async function adjustWalletAction(formData: FormData) {
    'use server';
    const { db: dbRef, session: current } = await requireAdmin();
    const direction = String(formData.get('direction') || 'add');
    const amount = Number(formData.get('amount'));
    const note = String(formData.get('note') || '').trim().slice(0, 300);
    const parentRef = dbRef.collection(COLLECTIONS.PARENT_WALLETS).doc(id);
    const snapNow = await parentRef.get();
    const before = Number(snapNow.data()?.balance) || 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(`/admin/parents/${id}?adjust_error=${encodeURIComponent('invalid_amount')}`);
    }

    try {
      if (direction === 'subtract') {
        // หัดได้เท่าที่มีเท่านั้น — ไม่ให้ยอดติดลบเงินจริง
        const res = await debitParentWallet(dbRef, {
          parentId: id,
          amount,
          kind: 'adjust',
          note: note || `ปรับยอดโดยแอดมิน (${current.uid})`,
        });
        if (!res.ok) {
          redirect(`/admin/parents/${id}?adjust_error=${encodeURIComponent(res.reason || 'adjust_failed')}`);
        }
      } else {
        await creditParentWallet(dbRef, {
          parentId: id,
          amount,
          kind: 'adjust',
          note: note || `ปรับยอดโดยแอดมิน (${current.uid})`,
        });
      }
    } catch {
      redirect(`/admin/parents/${id}?adjust_error=${encodeURIComponent('adjust_failed')}`);
    }

    const after = direction === 'subtract' ? before - amount : before + amount;
    redirect(`/admin/parents/${id}?adjusted=${encodeURIComponent(String(Math.round(after * 100) / 100))}`);
  }
  const summary = summarizeParentActivity(students, bookings, payments);
  const sortedBookings = sortByDateDesc(bookings, (booking) => `${booking.bookingDate || ''} ${booking.startTime || ''}`).slice(0, 50);
  const sortedPayments = [...payments].sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)).slice(0, 50);
  const hasMoreBookings = bookings.length > 50;
  const hasMorePayments = payments.length > 50;

  const STATS = [
    { label: 'นักเรียน', value: summary.studentCount, icon: <GraduationCap className="h-6 w-6" />, iconGradient: 'from-pink-500 to-rose-600' },
    { label: 'การจอง', value: summary.bookingCount, icon: <CalendarDays className="h-6 w-6" />, iconGradient: 'from-indigo-500 to-blue-600' },
    { label: 'รายการชำระเงิน', value: summary.paymentCount, icon: <CreditCard className="h-6 w-6" />, iconGradient: 'from-amber-500 to-orange-500' },
    { label: 'ยอดชำระแล้ว', value: formatCurrency(summary.paidAmount), icon: <History className="h-6 w-6" />, iconGradient: 'from-emerald-500 to-teal-600' },
  ];

  const ADJUST_ERRORS: Record<string, string> = {
    invalid_amount: 'จำนวนเงินไม่ถูกต้อง (ต้องมากกว่า 0)',
    insufficient_credit: 'ยอดเครดิตไม่พอสำหรับการหัก',
    adjust_failed: 'ปรับยอดไม่สำเร็จ กรุณาลองใหม่',
  };

  return (
    <DashboardLayout title="รายละเอียดผู้ปกครอง" navItems={ADMIN_NAV_ITEMS} role="admin" userName="แอดมิน">
      <Link href="/admin/parents" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-pink-600 hover:underline">
        <ArrowLeft className="h-4 w-4" />
        กลับไปจัดการผู้ปกครอง
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-pink-100 bg-white/80 p-5 shadow-sm backdrop-blur">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-edu-gradient text-xl font-extrabold text-white shadow-button">
          {parent.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parent.photoURL} alt={parent.displayName} className="h-full w-full rounded-2xl object-cover" />
          ) : (
            (parent.displayName || 'ผ').charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">{parent.displayName || 'ไม่ระบุชื่อ'}</h2>
            <Badge variant={parent.emailVerified || parent.isVerified ? 'success' : 'default'} dot>
              {parent.emailVerified || parent.isVerified ? 'ยืนยันอีเมลแล้ว' : 'ยังไม่ยืนยันอีเมล'}
            </Badge>
          </div>
          <p className="mt-0.5 break-all text-sm text-slate-500">{parent.email || '—'}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-400">UID: {parent.uid}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5"><MailCheck className="h-4 w-4 text-slate-400" /> สมัครเมื่อ {formatTimestamp(parent.createdAt)}</span>
          {parent.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> {parent.phone}</span>}
        </div>
      </div>

      {query.adjusted && (
        <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✓ ปรับยอดเครดิตเรียบร้อย — ยอดคงเหลือ {formatCurrency(Number(query.adjusted))} (ผู้ปกครองเห็นในหน้าการชำระเงินทันที)
        </p>
      )}
      {query.adjust_error && (
        <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {ADJUST_ERRORS[query.adjust_error] || 'ปรับยอดไม่สำเร็จ'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} iconGradient={stat.iconGradient} />
        ))}
      </div>

      <div className="mt-6">
        <SectionCard title="ข้อมูลบัญชีผู้ปกครอง">
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">ชื่อ</dt><dd className="font-semibold text-slate-800">{parent.displayName || '—'}</dd></div>
            <div><dt className="text-slate-500">อีเมล</dt><dd className="break-all text-slate-800">{parent.email || '—'}</dd></div>
            <div><dt className="text-slate-500">โทรศัพท์</dt><dd className="text-slate-800">{parent.phone || '—'}</dd></div>
            <div><dt className="text-slate-500">ที่อยู่</dt><dd className="whitespace-pre-wrap text-slate-800">{parent.address || '—'}</dd></div>
            <div><dt className="text-slate-500">Terms version</dt><dd className="text-slate-800">{parent.termsVersion || '—'}</dd></div>
            <div><dt className="text-slate-500">ยอมรับข้อตกลงเมื่อ</dt><dd className="text-slate-800">{formatTimestamp(parent.consentAcceptedAt)}</dd></div>
            <div><dt className="text-slate-500">Privacy version</dt><dd className="text-slate-800">{parent.privacyVersion || '—'}</dd></div>
            <div><dt className="text-slate-500">แก้ไขล่าสุด</dt><dd className="text-slate-800">{formatTimestamp(parent.updatedAt)}</dd></div>
          </dl>
          <p className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">ข้อมูล KYC และไฟล์เอกสารส่วนตัวไม่ได้แสดงในหน้าผู้ปกครองนี้</p>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="เครดิตวอลเล็ตของผู้ปกครอง">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold text-slate-500">ยอดคงเหลือ</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">{formatCurrency(walletBalance)}</p>
            </div>
            <div className="rounded-xl border border-pink-100 bg-pink-50/40 p-4">
              <p className="text-xs font-semibold text-slate-500">รับมาแล้ว (สะสม)</p>
              <p className="mt-1 text-lg font-extrabold text-slate-800">{formatCurrency(Number(wallet.totalCredited) || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">ใช้ไป (สะสม)</p>
              <p className="mt-1 text-lg font-extrabold text-slate-800">{formatCurrency(Number(wallet.totalSpent) || 0)}</p>
            </div>
          </div>

          <form action={adjustWalletAction} className="mt-4 space-y-3 rounded-xl border border-pink-100 bg-pink-50/30 p-4">
            <p className="text-xs text-slate-600">
              ปรับยอดเครดิต (ใช้เมื่อมีเครดิตค้าง/ผิดพลาด) — ทุกครั้งบันทึก ledger แบบ “ปรับยอดโดยแอดมิน”
              หักได้ไม่เกินยอดคงเหลือ ผู้ปกครองจะเห็นรายการนี้ในหน้าการชำระเงินทันที
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="ประเภท"
                name="direction"
                options={[
                  { value: 'add', label: 'เพิ่มเครดิต' },
                  { value: 'subtract', label: 'หักเครดิต' },
                ]}
                defaultValue="add"
              />
              <Input label="จำนวนเงิน (บาท)" name="amount" type="number" min="1" step="1" required placeholder="เช่น 100" />
              <Textarea label="เหตุผล (ไม่บังคับ)" name="note" rows={1} maxLength={300} placeholder="เช่น แก้ไขยอดที่คืนเงินซ้ำ" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="primary">
                <Wallet className="h-4 w-4" /> บันทึกการปรับยอด
              </Button>
            </div>
          </form>

          <div className="mt-5">
            <p className="mb-2 text-sm font-bold text-slate-900">ความเคลื่อนไหวล่าสุด</p>
            {walletTxs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                ยังไม่มีรายการเครดิตวอลเล็ต
              </p>
            ) : (
              <Table headers={['วันที่', 'ประเภท', 'จำนวน', 'ยอดหลังรายการ', 'หมายเหตุ']}>
                {walletTxs.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-slate-500">{formatTimestamp(tx.createdAt)}</TableCell>
                    <TableCell className="text-slate-700">{WALLET_TX_LABELS[tx.kind] || tx.kind}</TableCell>
                    <TableCell className={`font-semibold ${Number(tx.amount) >= 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {Number(tx.amount) > 0 ? '+' : ''}{formatCurrency(Number(tx.amount) || 0)}
                    </TableCell>
                    <TableCell className="text-slate-700">{formatCurrency(Number(tx.balanceAfter) || 0)}</TableCell>
                    <TableCell className="max-w-xs text-slate-500"><span className="line-clamp-2">{tx.note || '—'}</span></TableCell>
                  </TableRow>
                ))}
              </Table>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`นักเรียนในความดูแล (${students.length})`}>
          {students.length === 0 ? (
            <EmptyState icon={<Users className="h-7 w-7" />} title="ยังไม่มีนักเรียน" description="นักเรียนที่ผู้ปกครองเพิ่มจะแสดงที่นี่" />
          ) : (
            <Table headers={['ชื่อ', 'ระดับชั้น', 'โรงเรียน', 'หมายเหตุ']}>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-semibold text-slate-800">{student.name || '—'}</TableCell>
                  <TableCell className="text-slate-500">{student.level || '—'}</TableCell>
                  <TableCell className="text-slate-500">{student.school || '—'}</TableCell>
                  <TableCell className="max-w-xs text-slate-500"><span className="line-clamp-2">{student.notes || '—'}</span></TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`ประวัติการจอง (${bookings.length}${hasMoreBookings ? ' แสดงล่าสุด 50 รายการ' : ''})`}>
          {sortedBookings.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="ยังไม่มีการจอง" description="การจองของผู้ปกครองจะแสดงที่นี่" />
          ) : (
            <Table headers={['วันที่ / เวลา', 'คอร์ส', 'ครู', 'นักเรียน', 'ยอดรวม', 'สถานะ']}>
              {sortedBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell><p className="font-semibold text-slate-800">{booking.bookingDate || '—'}</p><p className="text-xs text-slate-500">{booking.startTime || '—'}{booking.endTime ? `–${booking.endTime}` : ''}</p></TableCell>
                  <TableCell className="text-slate-700">{booking.courseTitle || '—'}</TableCell>
                  <TableCell className="text-slate-500">{booking.teacherName || '—'}</TableCell>
                  <TableCell className="text-slate-500">{booking.studentName || '—'}</TableCell>
                  <TableCell className="font-semibold text-slate-700">{typeof booking.totalPrice === 'number' ? formatCurrency(booking.totalPrice) : '—'}</TableCell>
                  <TableCell><BookingStatusBadge status={booking.status || 'pending'} /></TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`ประวัติการชำระเงิน (${payments.length}${hasMorePayments ? ' แสดงล่าสุด 50 รายการ' : ''})`}>
          {sortedPayments.length === 0 ? (
            <EmptyState icon={<CreditCard className="h-7 w-7" />} title="ยังไม่มีการชำระเงิน" description="รายการชำระเงินของผู้ปกครองจะแสดงที่นี่" />
          ) : (
            <Table headers={['วันที่', 'คอร์ส', 'วิธีชำระ', 'จำนวนเงิน', 'สถานะ']}>
              {sortedPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-slate-500">{formatTimestamp(payment.createdAt)}</TableCell>
                  <TableCell className="text-slate-700">{payment.courseTitle || '—'}</TableCell>
                  <TableCell className="text-slate-500">{PAYMENT_METHOD_LABELS[payment.method] || payment.method || '—'}</TableCell>
                  <TableCell className="font-semibold text-slate-700">{formatCurrency(payment.amount || 0)}</TableCell>
                  <TableCell><PaymentStatusBadge status={payment.status || 'pending'} /></TableCell>
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
