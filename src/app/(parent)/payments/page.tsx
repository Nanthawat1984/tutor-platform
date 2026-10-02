import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Receipt, ReceiptText, CalendarDays, QrCode, CreditCard, Smartphone, Landmark, Clock, Wallet, Tag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PaymentStatusBadge } from '@/components/ui/badge';
import { PAYMENT_METHODS } from '@/lib/payments/config';
import {
  sweepExpiredPayments,
  isHistoryVisible,
  pendingExpiryMs,
} from '@/lib/payments/expiry';
import {
  ensureFirstBookingCoupon,
  validateCoupon,
  FIRST_BOOKING_MIN_AMOUNT,
} from '@/lib/coupons';

function methodIcon(method: string) {
  switch (method) {
    case 'stripe_checkout': return <CreditCard className="h-4 w-4" />;
    case 'promptpay': return <QrCode className="h-4 w-4" />;
    case 'credit_card': return <CreditCard className="h-4 w-4" />;
    case 'truemoney': return <Smartphone className="h-4 w-4" />;
    case 'bank_transfer': return <Landmark className="h-4 w-4" />;
    default: return <Receipt className="h-4 w-4" />;
  }
}

function methodLabel(method: string) {
  const legacyLabels: Record<string, string> = {
    promptpay: 'พร้อมเพย์',
    credit_card: 'บัตรเครดิต / เดบิต',
    truemoney: 'TrueMoney (รายการเดิม)',
    bank_transfer: 'โอนเงิน / สลิป',
  };
  return PAYMENT_METHODS.find((m) => m.id === method)?.label || legacyLabels[method] || method;
}

/** ข้อความนับถอยหลังสำหรับรายการรอชำระ (เหลือไม่เกิน 1 วันนับจากสร้างรายการ) */
function pendingCountdown(expiresInMs: number): { label: string; urgent: boolean } {
  if (expiresInMs <= 0) return { label: 'กำลังถูกยกเลิก...', urgent: true };
  const hours = Math.floor(expiresInMs / (60 * 60 * 1000));
  const minutes = Math.ceil((expiresInMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return { label: `รอชำระอีก ${hours} ชม. ${minutes} นาที (ไม่เกิน 1 วัน)`, urgent: hours < 6 };
  return { label: `รอชำระอีก ${minutes} นาที (ใกล้หมดเวลา!)`, urgent: true };
}

export default async function PaymentsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;

  // เก็บกวาดก่อนแสดงผล: pending เกิน 1 วัน → ยกเลิก, cancelled เกิน 3 วัน → ลบ
  try {
    await sweepExpiredPayments(db);
  } catch (error) {
    console.error('payment sweep failed (non-fatal):', error instanceof Error ? error.message : 'unknown');
  }

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('parentId', '==', parentId)
    .limit(100)
    .get();

  // Sort in memory to avoid requiring a composite index (parentId + createdAt).
  const nowMs = Date.now();
  const payments = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((p: any) => isHistoryVisible(p, nowMs)) // cancelled เกิน 3 วัน → หายจากประวัติ
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

  // ── คูปองลูกค้าใหม่: ออกให้อัตโนมัติตอนเข้าหน้านี้ (ยังไม่เคยจ่ายสำเร็จเท่านั้น)
  // เดิม API /api/coupons/mine มีอยู่แต่ไม่มีที่ไหนเรียก → ผู้ปกครองไม่มีทางรู้โค้ดของตัวเอง
  let welcomeCoupon: { code: string; discount: number; expiresAt: Date | null } | null = null;
  try {
    const ensured = await ensureFirstBookingCoupon(db, parentId);
    if (ensured?.code) {
      const check = await validateCoupon(db, ensured.code, FIRST_BOOKING_MIN_AMOUNT, parentId);
      if (check.ok) {
        const expMs = (check.coupon.expiresAt as any)?.toMillis?.() || 0;
        welcomeCoupon = {
          code: ensured.code,
          discount: check.discount,
          expiresAt: expMs ? new Date(expMs) : null,
        };
      }
    }
  } catch (error) {
    // ไม่มีคูปอง/ยังไม่ได้สร้าง coupons collection — หน้านี้ยังใช้ได้ปกติ
    console.error('welcome coupon load failed (non-fatal):', error instanceof Error ? error.message : 'unknown');
  }

  // ── วอลเล็ตผู้ปกครอง — เงินคืนจากการยกเลิกถูกเครดิตไว้ที่นี่ และถูกหักอัตโนมัติ
  // ตอนชำระครั้งถัดไป (debitParentWallet) — ผู้ปกครองต้องเห็นยอดนี้
  const walletSnap = await db.collection(COLLECTIONS.PARENT_WALLETS).doc(parentId).get();
  const wallet = walletSnap.exists ? walletSnap.data() as any : null;
  const walletBalance = Number(wallet?.balance) || 0;
  // query เมื่อ wallet มีอยู่จริง — ledger invariant ทำให้ balance === totalCredited - totalSpent เสมอ
  // ดังนั้นเงื่อนไข "ยอดไม่ตรง" จึงเป็น false เสมอและไม่เคยแสดงประวัติธุรกรรม
  const walletTxsSnap = wallet
    ? await db.collection(COLLECTIONS.PARENT_WALLET_TXS)
      .where('parentId', '==', parentId)
      .limit(20)
      .get()
    : null;
  const walletTxs = walletTxsSnap
    ? walletTxsSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      })
      .slice(0, 5)
    : [];

  return (
    <DashboardLayout
      title="การชำระเงิน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">ประวัติการชำระเงินและใบเสร็จของคุณ</p>

      {welcomeCoupon && (
        <Card className="mb-6 border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-lime-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-lime-600 shadow-sm">
                <Tag className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">คูปองลูกค้าใหม่ของคุณ</h3>
                <p className="text-xs text-slate-500">
                  โค้ด <span className="font-mono font-bold text-emerald-700">{welcomeCoupon.code}</span>
                  {' '}ลด {formatCurrency(welcomeCoupon.discount)} เมื่อชำระขั้นต่ำ {formatCurrency(FIRST_BOOKING_MIN_AMOUNT)}
                  {welcomeCoupon.expiresAt ? ` • ใช้ได้ถึง ${formatDate(welcomeCoupon.expiresAt.toISOString().slice(0, 10), 'd MMM yyyy')}` : ''}
                </p>
              </div>
            </div>
            <Link
              href="/my-bookings"
              className="shrink-0 rounded-xl bg-edu-gradient px-4 py-2 text-xs font-bold text-white shadow-button"
            >
              ไปจองคลาส
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            กรอกโค้ดนี้ในช่อง “รหัสคูปอง” ตอนชำระเงินของคลาส (ใช้ได้ครั้งเดียว)
          </p>
        </Card>
      )}

      {wallet && (
        <Card className="mb-6 border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-teal-50/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">เครดิตวอลเล็ตของคุณ</h3>
                <p className="text-xs text-slate-500">เงินคืนจากการยกเลิกคลาส — ถูกหักใช้อัตโนมัติเมื่อชำระครั้งถัดไป</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(walletBalance)}</p>
              <p className="text-[11px] text-slate-400">
                รับมาแล้ว {formatCurrency(Number(wallet.totalCredited) || 0)} • ใช้ไป {formatCurrency(Number(wallet.totalSpent) || 0)}
              </p>
            </div>
          </div>
          {walletTxs.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-emerald-100 pt-3">
              {walletTxs.map((tx: any) => {
                const isCredit = Number(tx.amount) > 0;
                const kindLabel: Record<string, string> = {
                  refund: 'เงินคืนจากการยกเลิก',
                  spend: 'ใช้ชำระค่าเรียน',
                  reversal: 'ปรับยอดย้อนหลัง',
                  adjust: 'ปรับยอดโดยแอดมิน',
                };
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500">
                      {kindLabel[tx.kind] || tx.kind}
                      {tx.createdAt?.toDate ? ` • ${formatDate(tx.createdAt.toDate().toISOString().slice(0, 10), 'd MMM yyyy')}` : ''}
                    </span>
                    <span className={`font-bold ${isCredit ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {isCredit ? '+' : ''}{formatCurrency(Number(tx.amount) || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {payments.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-7 w-7" />}
          title="ยังไม่มีรายการชำระเงิน"
          description="เมื่อคุณจองเรียนและชำระเงิน รายการจะแสดงที่นี่"
          action={{ label: 'ค้นหาครู', href: '/explore' }}
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p: any) => {
            const isPending = p.status === 'pending';
            const expiresInMs = isPending ? pendingExpiryMs(p) - nowMs : 0;
            const countdown = isPending ? pendingCountdown(expiresInMs) : null;
            return (
            <Card key={p.id}>
              <div className="responsive-card-row">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                      {methodIcon(p.method)}
                    </span>
                    <span className="font-semibold text-gray-900">{p.courseTitle || 'คอร์สเรียน'}</span>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {p.studentName} • {methodLabel(p.method)}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {p.paidAt ? formatDate(p.paidAt.toDate?.() || p.paidAt, 'd MMM yyyy') : formatDate(p.createdAt.toDate?.() || p.createdAt, 'd MMM yyyy')}
                    </span>
                    {(p.receiptNumber || p.transactionId) && (
                      <span className="font-mono">#{p.receiptNumber || p.transactionId}</span>
                    )}
                  </p>
                  {countdown && (
                    <p className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${countdown.urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {countdown.label}
                    </p>
                  )}
                </div>
                <div className="w-full text-left sm:w-auto sm:text-right">
                  <p className="font-bold text-pink-700">{formatCurrency(p.amount)}</p>
                  {isPending && (
                    <Link href={`/bookings/${p.bookingId}/payment`} className="mt-2 inline-block">
                      <Button size="sm" className="w-full sm:w-auto">ชำระเงิน</Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* ใบเสร็จ */}
              {(p.status === 'paid' || p.status === 'refunded') && (
                <div className="mt-3 border-t border-pink-100 pt-3">
                  <Link href={`/payments/${p.id}/receipt`}>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">ดู / พิมพ์ใบเสร็จ PDF</Button>
                  </Link>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
