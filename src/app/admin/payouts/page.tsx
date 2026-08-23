import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import KycFileUploader from '@/components/teacher/kyc-file-uploader';
import {
  createStripeConnectTransfer,
  getStripeConnectMode,
  isStripeConnectReadyForTransfers,
  retrieveStripeConnectAccount,
} from '@/lib/payments/connect';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  requested: { label: 'รอดำเนินการ', cls: 'bg-amber-100 text-amber-700' },
  processing: { label: 'กำลังโอน', cls: 'bg-sky-100 text-sky-700' },
  paid: { label: 'โอนแล้ว', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-700' },
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const params = await searchParams;
  const connectMode = getStripeConnectMode();

  // Admin guard
  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    redirect('/dashboard');
  }

  const statusFilter = params.status || '';

  // ── โหลด payouts + ข้อมูลครู ──
  const payoutsSnap = statusFilter
    ? await db.collection(COLLECTIONS.PAYOUTS).where('status', '==', statusFilter).limit(200).get()
    : await db.collection(COLLECTIONS.PAYOUTS).limit(200).get();

  const payouts = payoutsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

  // เติมชื่อครู
  const teacherIds = Array.from(new Set(payouts.map((p: any) => p.teacherId)));
  const teacherInfo = new Map<string, string>();
  const teacherConnectInfo = new Map<string, { accountId?: string; transfersStatus?: string | null }>();
  if (teacherIds.length) {
    const snaps = await db.getAll(...teacherIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id)));
    snaps.forEach((s) => {
      const data = s.exists ? s.data() as any : {};
      teacherInfo.set(s.id, data.displayName || '-');
      teacherConnectInfo.set(s.id, {
        accountId: data.stripeConnectAccountId,
        transfersStatus: data.stripeConnectTransfersStatus,
      });
    });
  }

  async function updatePayoutAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    // Admin guard ซ้ำ
    const adminSession = await requireSessionUser();
    const adminDoc = await dbRef.collection(COLLECTIONS.USERS).doc(adminSession.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') return;

    const payoutId = formData.get('payout_id') as string;
    const newStatus = formData.get('new_status') as string;
    const slipURL = (formData.get('slipURL') as string) || null;
    const note = (formData.get('note') as string) || null;
    if (!payoutId || !['processing', 'paid', 'rejected'].includes(newStatus)) return;

    const updates: Record<string, unknown> = {
      status: newStatus,
      note,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (slipURL) updates.slipURL = slipURL;
    if (newStatus === 'paid') updates.paidAt = FieldValue.serverTimestamp();

    const payoutRef = dbRef.collection(COLLECTIONS.PAYOUTS).doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) return;
    const payout = payoutSnap.data() as any;
    if (payout.status === 'paid') return;

    const useConnect = formData.get('connect_transfer') === '1' && newStatus === 'paid';
    let connectTransferId: string | undefined;
    if (useConnect) {
      if (connectMode === 'disabled') {
        redirect('/admin/payouts?error=connect_disabled');
        return;
      }
      if (connectMode === 'locked') {
        redirect('/admin/payouts?error=connect_locked');
        return;
      }
      const teacherSnap = await dbRef.collection(COLLECTIONS.USERS).doc(payout.teacherId).get();
      const teacher = teacherSnap.exists ? teacherSnap.data() as any : {};
      if (!teacher.stripeConnectAccountId) {
        redirect('/admin/payouts?error=connect_not_onboarded');
        return;
      }
      const connectStatus = await retrieveStripeConnectAccount(teacher.stripeConnectAccountId).catch(() => null);
      if (!connectStatus || !isStripeConnectReadyForTransfers(connectStatus)) {
        redirect('/admin/payouts?error=connect_not_ready');
        return;
      }
      const transfer = await createStripeConnectTransfer({
        payoutId,
        accountId: teacher.stripeConnectAccountId,
        amount: Number(payout.amount) || 0,
        currency: 'thb',
      });
      if (transfer.status !== 'created') {
        redirect(`/admin/payouts?error=connect_${transfer.status}`);
        return;
      }
      connectTransferId = transfer.transferId;
    }

    const payoutUpdates = {
      ...updates,
      ...(connectTransferId ? {
        payoutMethod: 'stripe_connect',
        stripeTransferId: connectTransferId,
        stripeTransferStatus: 'created',
      } : {}),
    };

    if (newStatus === 'paid') {
      const walletRef = dbRef.collection(COLLECTIONS.WALLETS).doc(payout.teacherId);
      await dbRef.runTransaction(async (tx) => {
        const latestPayoutSnap = await tx.get(payoutRef);
        if (!latestPayoutSnap.exists || latestPayoutSnap.data()?.status === 'paid') return;
        tx.update(payoutRef, { ...payoutUpdates, walletDebitRecorded: true });
        tx.update(walletRef, {
          availableBalance: FieldValue.increment(-(Number(payout.amount) || 0)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } else {
      await payoutRef.update(payoutUpdates);
    }

    // แจ้งเตือนครู + ลบจาก availableBalance เมื่อโอนสำเร็จ
    if (newStatus === 'paid') {
      await dbRef.collection(COLLECTIONS.NOTIFICATIONS).add({
        userId: payout.teacherId,
        type: 'payout',
        title: '💰 โอนเงินสำเร็จ',
        body: connectTransferId
          ? `เงินเบิก ${formatCurrency(payout.amount)} บาทถูกส่งเข้า Stripe Connect แล้ว — ตรวจสอบสถานะได้ที่หน้ารายได้`
          : `เงินเบิก ${formatCurrency(payout.amount)} บาท โอนเข้าบัญชี ${payout.bankName} ${payout.accountNumber} แล้ว — ดูหลักฐานการโอนได้ที่หน้ารายได้`,
        data: { payoutId, slipURL, payoutMethod: connectTransferId ? 'stripe_connect' : 'manual' },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else if (newStatus === 'rejected') {
      await dbRef.collection(COLLECTIONS.NOTIFICATIONS).add({
        userId: payout.teacherId,
        type: 'payout',
        title: 'คำขอเบิกเงินถูกปฏิเสธ',
        body: note || 'กรุณาตรวจสอบข้อมูลบัญชีและลองใหม่อีกครั้ง',
        data: { payoutId },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    redirect('/admin/payouts');
  }

  return (
    <DashboardLayout
      title="จัดการการเบิกเงินครู"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'Admin'}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          ← กลับไปแดชบอร์ดแอดมิน
        </Link>
        <form method="get" className="flex items-center gap-2">
          <select name="status" defaultValue={statusFilter} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">ทุกสถานะ</option>
            <option value="requested">รอดำเนินการ</option>
            <option value="processing">กำลังโอน</option>
            <option value="paid">โอนแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
          <button type="submit" className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">
            กรอง
          </button>
        </form>
      </div>

      {params.error && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {params.error === 'connect_locked' && 'Stripe Connect ยังถูกล็อกเพื่อป้องกันการโอนเงินจริง'}
          {params.error === 'connect_disabled' && 'ยังไม่ได้เปิด Stripe Connect ในระบบ'}
          {params.error === 'connect_not_onboarded' && 'ครูยังไม่ได้เชื่อมบัญชี Stripe Connect'}
          {params.error === 'connect_not_ready' && 'บัญชี Stripe Connect ยังตรวจสอบไม่เสร็จหรือยังรับโอนไม่ได้'}
          {params.error === 'connect_invalid' && 'ยอดหรือบัญชี Stripe Connect ไม่ถูกต้อง'}
        </div>
      )}

      {payouts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ไม่มีรายการเบิกเงิน
        </div>
      ) : (
        <div className="space-y-4">
          {payouts.map((p: any) => {
            const st = STATUS_LABEL[p.status] || STATUS_LABEL.requested;
            const connectInfo = teacherConnectInfo.get(p.teacherId);
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      <span className="text-lg font-bold text-slate-900">{formatCurrency(p.amount)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      <Link href={`/teachers/${p.teacherId}`} className="font-medium text-pink-700 hover:underline">
                        {teacherInfo.get(p.teacherId) || '-'}
                      </Link>
                      {' • '}{p.bankName} • {p.accountNumber} • {p.accountName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">ขอเมื่อ {p.createdAt ? formatDate(p.createdAt.toDate?.() || p.createdAt, 'd MMM yyyy HH:mm') : '-'}</p>
                  </div>
                  {p.slipURL && (
                    <a href={p.slipURL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-pink-700 underline">
                      🧾 หลักฐานโอน
                    </a>
                  )}
                </div>

                {/* ฟอร์มอัปเดตสถานะ */}
                {p.status !== 'paid' && (
                  <form action={updatePayoutAction} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                    <input type="hidden" name="payout_id" value={p.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-600">อัปโหลดหลักฐานการโอน (สลิป)</p>
                        <KycFileUploader
                          uid={p.id}
                          folder="payout-slips"
                          fieldName="slipURL"
                          label="แนบสลิปโอนเงิน"
                          hint="JPG/PNG/PDF — แนบก่อนกด 'ยืนยันโอนแล้ว'"
                          initialUrl={p.slipURL}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-600">สถานะใหม่</p>
                        <select name="new_status" defaultValue={p.status === 'requested' ? 'processing' : p.status} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                          <option value="processing">กำลังโอน</option>
                          <option value="paid">✅ โอนแล้ว (แนบสลิปก่อน)</option>
                          <option value="rejected">❌ ปฏิเสธ</option>
                        </select>
                        <input name="note" placeholder="หมายเหตุ (ถ้าปฏิเสธ)" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        {connectInfo?.accountId && (
                          <label className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                            <input type="checkbox" name="connect_transfer" value="1" className="mt-0.5" disabled={connectMode === 'disabled' || connectMode === 'locked' || connectInfo.transfersStatus !== 'active'} />
                            <span>
                              ส่งผ่าน Stripe Connect
                              <span className="mt-0.5 block text-[10px] text-sky-600">
                                {connectInfo.transfersStatus === 'active' ? `โหมด ${connectMode === 'test' ? 'ทดสอบ' : connectMode === 'live' ? 'ใช้งานจริง' : 'ล็อก'}` : 'รอ Stripe ยืนยันความพร้อม'}
                              </span>
                            </span>
                          </label>
                        )}
                      </div>
                    </div>
                    <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                      บันทึก
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
