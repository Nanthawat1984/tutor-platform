import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { markPaymentPaid, markPaymentFailed } from '@/lib/payments/process';
import { MOCK_MODE, generateRef } from '@/lib/payments/config';

/**
 * POST /api/payments/confirm
 * Body: { paymentId, slipURL? }
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
  const slipURL = body.slipURL as string | undefined;

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

  // เก็บ slipURL (สำหรับวิธี bank_transfer) ก่อนยืนยัน
  if (slipURL && payment.method === 'bank_transfer') {
    await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
      slipURL,
      updatedAt: new Date(),
    } as any);
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
