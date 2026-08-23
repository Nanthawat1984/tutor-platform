import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Wallet, Lock, Banknote, ReceiptText, FileText, ShieldCheck, Landmark } from 'lucide-react';
import { DashboardLayout, StatCard, SectionCard, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { PaymentStatusBadge } from '@/components/ui/badge';
import { PAYMENT_METHODS } from '@/lib/payments/config';
import { getNextTransferDate, formatTransferDate } from '@/lib/payments/schedule';

const PAYOUT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  requested: { label: 'รอดำเนินการ', cls: 'bg-amber-100 text-amber-700' },
  processing: { label: 'กำลังโอน', cls: 'bg-sky-100 text-sky-700' },
  paid: { label: 'โอนแล้ว', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-700' },
};

export default async function EarningsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  // ดึงเฉพาะ payment ของครูคนนี้ (แก้บั๊กเดิมที่อ่านทั้งหมด)
  const [paymentsSnap, walletSnap, userSnap, payoutsSnap] = await Promise.all([
    db.collection(COLLECTIONS.PAYMENTS)
      .where('teacherId', '==', teacherId)
      .where('status', '==', 'paid')
      .limit(100)
      .get(),
    db.collection(COLLECTIONS.WALLETS).doc(teacherId).get(),
    db.collection(COLLECTIONS.USERS).doc(teacherId).get(),
    db.collection(COLLECTIONS.PAYOUTS)
      .where('teacherId', '==', teacherId)
      .limit(50)
      .get(),
  ]);

  // Sort in memory to avoid requiring a composite index (teacherId + status + paidAt).
  const payments = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.paidAt?.toMillis ? a.paidAt.toMillis() : 0;
      const tb = b.paidAt?.toMillis ? b.paidAt.toMillis() : 0;
      return tb - ta;
    });
  const totalNet = payments.reduce((sum: number, p: any) => sum + (p.netAmount || 0), 0);

  const wallet = walletSnap.exists ? walletSnap.data() as any : null;
  const pendingBalance = wallet?.pendingBalance || 0;
  const availableBalance = wallet?.availableBalance || 0;

  // ── KYC + payouts ──
  const user = userSnap.exists ? userSnap.data() as any : {};
  const kycStatus: string = user.kycStatus || 'none';
  const kycVerified = kycStatus === 'verified';

  const payouts = payoutsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

  // ── Server action: ขอเบิกเงิน ──
  async function requestPayoutAction() {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const sessionUser = (await requireRole(['teacher'])).session;

    const [walletDoc, userDoc] = await Promise.all([
      dbRef.collection(COLLECTIONS.WALLETS).doc(sessionUser.uid).get(),
      dbRef.collection(COLLECTIONS.USERS).doc(sessionUser.uid).get(),
    ]);
    const w = walletDoc.exists ? walletDoc.data() as any : null;
    const u = userDoc.exists ? userDoc.data() as any : {};

    if (u.kycStatus !== 'verified') {
      redirect('/profile/payout');
      return;
    }
    const amount = Math.floor(w?.availableBalance || 0);
    if (amount <= 0) return;

    // มี payout ที่ยังไม่เสร็จอยู่ → ไม่ให้ขอซ้ำ
    const open = await dbRef.collection(COLLECTIONS.PAYOUTS)
      .where('teacherId', '==', sessionUser.uid)
      .where('status', 'in', ['requested', 'processing'])
      .limit(1)
      .get();
    if (!open.empty) {
      redirect('/earnings?error=open_payout');
      return;
    }

    await dbRef.collection(COLLECTIONS.PAYOUTS).add({
      teacherId: sessionUser.uid,
      amount,
      status: 'requested',
      bankName: u.payoutBankName || '',
      accountName: u.payoutAccountName || '',
      accountNumber: u.payoutAccountNumber || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    redirect('/earnings?payout=requested');
  }

  const STATS = [
    {
      label: 'รายได้สุทธิสะสม',
      value: formatCurrency(totalNet),
      subtext: 'หลังหักค่าบริการ 20%',
      icon: <Wallet className="h-6 w-6" />,
      iconGradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'ยอดรอปล่อย (escrow)',
      value: formatCurrency(pendingBalance),
      subtext: 'ปล่อยเมื่อเรียนเสร็จ',
      icon: <Lock className="h-6 w-6" />,
      iconGradient: 'from-amber-500 to-orange-500',
    },
    {
      label: 'ยอดพร้อมโอน',
      value: formatCurrency(availableBalance),
      subtext: `โอน ${formatTransferDate(getNextTransferDate())}`,
      icon: <Banknote className="h-6 w-6" />,
      iconGradient: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <DashboardLayout
      title="รายได้"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">สรุปรายได้และกระเป๋าเงินของคุณ (escrow)</p>

      {/* ── KYC banner ── */}
      {!kycVerified && (
        <Link
          href="/profile/payout"
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <ShieldCheck className="h-8 w-8 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-amber-900">
              {kycStatus === 'pending' ? '⏳ เอกสาร KYC อยู่ระหว่างตรวจสอบ (1–3 วันทำการ)' : 'ยืนยันตัวตน + เพิ่มบัญชีรับเงิน เพื่อเปิดใช้การเบิกเงิน'}
            </span>
            <span className="block text-xs text-amber-700">
              {kycStatus === 'pending' ? 'คุณจะได้รับการแจ้งเตือนเมื่อตรวจสอบเสร็จ' : 'แนบสมุดบัญชี + บัตรประชาชน และกรอกเลขบัญชีธนาคาร'}
            </span>
          </span>
        </Link>
      )}

      {/* ── ขอเบิกเงิน ── */}
      {kycVerified && (
        <div className="mt-6">
          <SectionCard title={`รอบโอนถัดไป — ${formatTransferDate(getNextTransferDate())}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              <p>ยอดที่เบิกได้: <strong className="text-emerald-700">{formatCurrency(availableBalance)}</strong></p>
              <p className="mt-0.5 text-xs text-slate-400">
                🏦 {user.payoutBankName || '-'} • {user.payoutAccountNumber || '-'} • {user.payoutAccountName || '-'}
              </p>
              <p className="mt-1 text-xs text-sky-600">
                📅 สรุปยอดทุกวันอังคาร • โอนเงินวันพฤหัสบดี 17:00 เป็นต้นไปของทุกสัปดาห์
              </p>
            </div>
            <form action={requestPayoutAction}>
              <button
                type="submit"
                disabled={availableBalance <= 0}
                className="w-full rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                <Landmark className="mr-1 inline h-4 w-4" /> ขอเบิกเงิน
              </button>
            </form>
          </div>
          </SectionCard>
        </div>
      )}

      {/* ── ประวัติการเบิกเงิน ── */}
      {payouts.length > 0 && (
        <div className="mt-6">
          <SectionCard title="ประวัติการเบิกเงิน">
            <div className="space-y-2">
              {payouts.map((p: any) => {
                const st = PAYOUT_STATUS_LABEL[p.status] || PAYOUT_STATUS_LABEL.requested;
                return (
                  <div key={p.id} className="responsive-card-row rounded-xl border border-pink-100/60 bg-pink-50/40 p-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(p.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.bankName} • {p.accountNumber} • ขอเมื่อ {p.createdAt ? formatDate(p.createdAt.toDate?.() || p.createdAt, 'd MMM yyyy') : '-'}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto sm:text-right">
                      {p.slipURL ? (
                        <a href={p.slipURL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-pink-700 underline">
                          🧾 ดูหลักฐานการโอน
                        </a>
                      ) : p.status === 'paid' ? (
                        <span className="text-xs text-emerald-600">โอนสำเร็จ</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* เอกสารภาษี e-Tax */}
      <Link
        href="/earnings/tax-document"
        className="mb-6 flex items-center gap-3 rounded-xl border border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50 p-4 transition-colors hover:border-pink-300 hover:from-pink-100 print:hidden"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-600 text-white">
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">เอกสารสรุปรายได้เพื่อยื่นภาษี (e-Tax)</span>
          <span className="block text-xs text-slate-500">ดูสรุปรายได้รายปี พิมพ์หรือบันทึกเป็นไฟล์ PDF สำหรับยื่นภาษี</span>
        </span>
      </Link>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <div className="mt-6">
        <SectionCard title="การจ่ายเงิน (Escrow)">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              ค่าบริการแพลตฟอร์มคิด 20% ของรายได้ต่อเซสชัน เงินจะถูกเก็บใน escrow จนกว่าเซสชันเรียนจะเสร็จ
              แล้วจึงปล่อยเข้ายอดพร้อมโอนของคุณ
            </p>
            <span className="pill-badge-info shrink-0">สรุปยอดวันอังคาร • โอนวันพฤหัส 17:00</span>
          </div>
        </SectionCard>
      </div>

      {/* ประวัติการชำระเงิน */}
      <div className="mt-8">
        <SectionCard title="ประวัติการชำระเงิน">
          {payments.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="h-7 w-7" />}
              title="ยังไม่มีรายได้"
              description="เมื่อผู้ปกครองชำระเงินค่าคอร์สของคุณ รายการจะแสดงที่นี่"
            />
          ) : (
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div key={p.id} className="responsive-card-row rounded-xl border border-pink-100/60 bg-pink-50/40 p-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{p.studentName}</span>
                      <PaymentStatusBadge status={p.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.courseTitle} • {PAYMENT_METHODS.find((m) => m.id === p.method)?.label || p.method}
                      {p.paidAt && <> • {formatDate(p.paidAt.toDate?.() || p.paidAt, 'd MMM yyyy')}</>}
                    </p>
                  </div>
                  <div className="w-full text-left sm:w-auto sm:text-right">
                    <p className="font-bold text-emerald-700">+{formatCurrency(p.netAmount || 0)}</p>
                    <p className="text-[11px] text-slate-400">ยอดชำระ {formatCurrency(p.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
