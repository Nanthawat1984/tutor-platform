import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { markPaymentPaid, markPaymentFailed } from '@/lib/payments/process';
import { MOCK_MODE, BANK_ACCOUNT, generateRef } from '@/lib/payments/config';
import { analyzePaymentSlip } from '@/lib/payments/slip-agent';

/**
 * POST /api/payments/confirm
 * Body: { paymentId, slipPath? }
 *
 * MOCK MODE: จำลอง gateway สำเร็จทันที (transactionId = mock_xxx) แล้วประมวลผลชำระเงิน
 * STRIPE MODE: Checkout Session จะยืนยันผ่าน Stripe webhook
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const paymentId = body.paymentId as string | undefined;
  const slipPath = typeof body.slipPath === 'string' ? body.slipPath.trim() : '';

  if (!paymentId) return NextResponse.json({ error: 'missing_payment_id' }, { status: 400 });

  const paymentSnap = await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();
  if (!paymentSnap.exists) return NextResponse.json({ error: 'payment_not_found' }, { status: 404 });
  const payment = { id: paymentSnap.id, ...paymentSnap.data() } as any;

  if (payment.parentId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'payment_not_pending', status: payment.status }, { status: 409 });
  }

  // การโอนเข้าบัญชีบริษัทต้องผ่าน Admin review ห้าม mark paid จาก client
  if (payment.method === 'bank_transfer') {
    // แพ็กเกจใช้ bookingId=null — prefix สลิปอ้าง paymentId แทน
    const expectedPrefix = payment.kind === 'package' && payment.packagePurchaseId
      ? `payment-slips/package-${payment.packagePurchaseId}/`
      : `payment-slips/${payment.bookingId}/`;
    if (!slipPath || !slipPath.startsWith(expectedPrefix) || slipPath.length > 512) {
      return NextResponse.json({ error: 'invalid_slip_path' }, { status: 400 });
    }
    const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc(paymentId);
    await paymentRef.update({
      slipPath,
      status: 'awaiting_review',
      submittedAt: new Date(),
      reviewNote: null,
      updatedAt: new Date(),
    } as any);
    let agentResult;
    let slipHash: string | null = null;
    try {
      const storage = getServerStorage();
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
      const fileRef = storage?.bucket(bucketName).file(slipPath);
      if (!fileRef) throw new Error('storage_unavailable');
      const [buffer] = await fileRef.download();
      const [metadata] = await fileRef.getMetadata();
      const mimeType = metadata.contentType || 'image/jpeg';
      const expectedReference = typeof payment.providerRef === 'string'
        ? payment.providerRef.replace(/^manual_/, '')
        : null;
      const { hashSlipBuffer } = await import('@/lib/payments/auto-approve');
      slipHash = hashSlipBuffer(buffer);
      agentResult = await analyzePaymentSlip({
        buffer,
        mimeType,
        expectedAmount: Number(payment.amount) || 0,
        expectedReference,
      });
    } catch {
      agentResult = { status: 'unavailable', confidence: null, extracted: {}, reasons: ['agent_input_unavailable'], model: null };
    }
    const recipientLast4 = (agentResult.extracted as any)?.recipientAccountLast4 || null;
    const recipientMatchesCompany = (() => {
      if (!recipientLast4) return null;
      const companyDigits = BANK_ACCOUNT.accountNumber.replace(/\D/g, '').slice(-4);
      return companyDigits ? recipientLast4 === companyDigits : null;
    })();
    await paymentRef.update({
      agentStatus: agentResult.status,
      agentConfidence: agentResult.confidence,
      agentExtracted: agentResult.extracted,
      agentReasons: agentResult.reasons,
      agentModel: agentResult.model,
      agentAnalyzedAt: new Date(),
      recipientLast4,
      recipientMatchesCompany,
      slipHash,
      updatedAt: new Date(),
    } as any);

    // ── Auto-approve (เฟส 1คู่): หลักฐานครบ+เสี่ยงต่ำมาก → paid ทันที ไม่ต้องรอแอดมิน ──
    if (process.env.SLIP_AUTO_APPROVE_ENABLED === 'true' && slipHash) {
      const { evaluateSlipAutoApprove } = await import('@/lib/payments/auto-approve');
      // กันสลิปวน: เคยมี slipHash นี้ใน payment ที่ paid/awaiting_review อื่นหรือไม่
      const dupeSnap = await db.collection(COLLECTIONS.PAYMENTS)
        .where('slipHash', '==', slipHash)
        .limit(5)
        .get();
      const duplicateSlip = dupeSnap.docs.some((d: any) => d.id !== paymentId && ['paid', 'awaiting_review'].includes(d.data()?.status));
      const decision = evaluateSlipAutoApprove({
        agentStatus: agentResult.status,
        agentConfidence: agentResult.confidence,
        extractedAmount: (agentResult.extracted as any)?.amount ?? null,
        extractedReference: (agentResult.extracted as any)?.reference ?? null,
        expectedAmount: Number(payment.amount) || 0,
        expectedReference: typeof payment.providerRef === 'string' ? payment.providerRef.replace(/^manual_/, '') : null,
        recipientMatchesCompany,
        duplicateSlip,
      });
      if (decision.approved) {
        const { markPaymentPaid } = await import('@/lib/payments/process');
        const result = await markPaymentPaid(db, paymentId, {
          transactionId: `auto_${paymentId.slice(0, 8)}`,
          providerRef: payment.providerRef,
        });
        if (result.ok) {
          await paymentRef.update({
            autoApproved: true,
            autoApproveReasons: decision.reasons,
            reviewedBy: 'system:auto-approve',
            reviewedAt: new Date(),
            updatedAt: new Date(),
          } as any);
          const { logEvent } = await import('@/lib/log');
          logEvent('info', 'slip_auto_approved', { paymentId });
          return NextResponse.json({ ok: true, autoApproved: true, bookingId: payment.bookingId, purchaseId: (payment as any).packagePurchaseId || null });
        }
      } else {
        await paymentRef.update({ autoApproveReasons: decision.reasons, updatedAt: new Date() } as any);
      }
    }

    if (payment.kind === 'package') {
      return NextResponse.json({ ok: true, awaitingReview: true, purchaseId: payment.packagePurchaseId }, { status: 202 });
    }
    return NextResponse.json({ ok: true, awaitingReview: true, bookingId: payment.bookingId }, { status: 202 });
  }

  try {
    if (payment.provider === 'stripe') {
      return NextResponse.json(
        { error: 'awaiting_webhook', message: 'Stripe จะยืนยันการชำระเงินผ่าน webhook' },
        { status: 202 },
      );
    }

    if (MOCK_MODE) {
      // ── MOCK GATEWAY: สำเร็จทันที ──
      const transactionId = `mock_${generateRef('CHG')}`;
      const result = await markPaymentPaid(db, paymentId, { transactionId, providerRef: payment.providerRef });
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 409 });
      }
      // แพ็กเกจ (bookingId=null) คืน purchaseId ให้ client พาไปหน้าสำเร็จถูก
      if (payment.kind === 'package') {
        return NextResponse.json({ ok: true, purchaseId: payment.packagePurchaseId, transactionId });
      }
      return NextResponse.json({ ok: true, bookingId: payment.bookingId, transactionId });
    }

    // Legacy non-mock records are finalized only by their provider webhook.
    return NextResponse.json(
      { error: 'awaiting_webhook', message: 'การชำระเงินจะยืนยันเมื่อ gateway ส่ง webhook กลับมา' },
      { status: 202 },
    );
  } catch (e: any) {
    console.error('Confirm payment error:', e);
    return NextResponse.json({ error: 'confirm_failed', message: e.message }, { status: 502 });
  }
}
