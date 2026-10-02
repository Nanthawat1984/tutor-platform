import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS, type PaymentMethod } from '@/types/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  BANK_ACCOUNT,
  computeFees,
  generateRef,
  getPaymentProvider,
  PAYMENT_METHODS,
  PROMPTPAY_NUMBER,
  PROMPTPAY_OWNER,
} from '@/lib/payments/config';
import { createStripeCheckoutSession } from '@/lib/payments/stripe';
import { generateQRDataUrl, buildMockPromptPayPayload } from '@/lib/payments/qr';
import { getPaymentForBooking } from '@/lib/payments/process';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';

const VALID_METHODS = PAYMENT_METHODS.map((method) => method.id) as PaymentMethod[];

function normalizeMethod(value: unknown): PaymentMethod | null {
  if (value === 'promptpay' || value === 'credit_card') return 'stripe_checkout';
  return typeof value === 'string' && VALID_METHODS.includes(value as PaymentMethod)
    ? value as PaymentMethod
    : null;
}

/**
 * POST /api/payments/initiate
 * Body: { bookingId, method, couponCode?, useWallet? }
 * - คูปอง: ตรวจ + ล็อกส่วนลดไว้ที่ payment (consume จริงตอน paid)
 * - วอลเล็ต: หักเครดิตได้บางส่วน/ทั้งหมด ถ้ายอดเหลือ 0 จะ mark paid ทันที
 * Stripe Checkout handles card/PromptPay; bank transfer and Mock remain available.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 10 ครั้ง / 10 นาที ต่อผู้ใช้ — กันยิงรัวเพื่อสร้าง payment/Stripe session (fail-open ถ้า limiter พัง)
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`pay_initiate:${session.uid}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : '';
  const method = normalizeMethod(body.method);
  const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase().slice(0, 32) : '';
  const useWallet = body.useWallet === true;
  if (!bookingId) return NextResponse.json({ error: 'missing_booking_id' }, { status: 400 });
  if (!method) return NextResponse.json({ error: 'invalid_method' }, { status: 400 });

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) return NextResponse.json({ error: 'booking_not_found' }, { status: 404 });
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (booking.status !== 'pending') return NextResponse.json({ error: 'booking_not_payable' }, { status: 409 });
  if (booking.paidWithCredit) return NextResponse.json({ error: 'booking_not_payable' }, { status: 409 });

  const gross = Number(booking.totalPrice) || 0;
  if (!Number.isFinite(gross) || gross <= 0) {
    return NextResponse.json({ error: 'invalid_payment_amount' }, { status: 422 });
  }

  // คูปอง (ถ้าส่งมา): ตรวจตอนนี้ ล็อกส่วนลดไว้ที่ payment แล้ว consume ตอน paid
  let couponId: string | null = null;
  let discount = 0;
  if (couponCode) {
    const { validateCoupon } = await import('@/lib/coupons');
    const check = await validateCoupon(db, couponCode, gross, session.uid);
    if (!check.ok) {
      return NextResponse.json(
        { error: 'coupon_invalid', reason: check.reason, minAmount: (check as any).minAmount },
        { status: 422 },
      );
    }
    couponId = check.coupon.id;
    discount = check.discount;
  }

  // วอลเล็ต (ถ้าขอใช้): ดูยอดแล้วหักร่วมจ่าย
  let walletApplied = 0;
  if (useWallet) {
    const wSnap = await db.collection(COLLECTIONS.PARENT_WALLETS).doc(session.uid).get();
    const balance = Math.round((Number(wSnap.data()?.balance) || 0) * 100) / 100;
    walletApplied = Math.max(0, Math.min(balance, gross - discount));
  }

  const amount = Math.max(0, Math.round((gross - discount - walletApplied) * 100) / 100);

  // จ่ายครบด้วยคูปอง+เครดิต (ยอดเหลือ 0) → เปิดใช้ทันที ไม่ต้องผ่าน gateway
  if (amount <= 0) {
    const existing = await getPaymentForBooking(db, bookingId);
    const { createPaymentForBooking, markPaymentPaid } = await import('@/lib/payments/process');
    const { debitParentWallet } = await import('@/lib/parent-wallet');
    let payId = existing?.id;
    if (existing) {
      await db.collection(COLLECTIONS.PAYMENTS).doc(existing.id).update({
        amount: 0,
        fees: 0,
        netAmount: 0,
        method,
        kind: 'session',
        couponCode: couponCode || null,
        couponId,
        discountAmount: discount,
        walletApplied,
        status: 'pending',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const created = await createPaymentForBooking(db, booking, {
        method,
        couponCode: couponCode || null,
        couponId,
        discountAmount: discount,
      });
      payId = created.id;
      await db.collection(COLLECTIONS.PAYMENTS).doc(created.id).update({
        amount: 0,
        fees: 0,
        netAmount: 0,
        walletApplied,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (walletApplied > 0) {
      const debited = await debitParentWallet(db, {
        parentId: session.uid,
        amount: walletApplied,
        kind: 'spend',
        bookingId,
        paymentId: payId!,
        note: 'ใช้เครดิตชำระค่าคอร์ส',
      });
      if (!debited.ok) {
        return NextResponse.json({ error: 'insufficient_credit' }, { status: 409 });
      }
      await db.collection(COLLECTIONS.PAYMENTS).doc(payId!).update({
        walletDeducted: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const result = await markPaymentPaid(db, payId!, { transactionId: `wallet_${payId!.slice(0, 8)}` });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ ok: true, paymentId: payId, paidByCredit: true, gross, discount, walletApplied });
  }

  const provider = getPaymentProvider();
  const isStripeCheckout = method === 'stripe_checkout' && provider === 'stripe';
  const paymentProvider = isStripeCheckout ? 'stripe' : 'mock';
  const { fees, netAmount } = computeFees(amount);
  const ref = generateRef('TF');
  const expiresAt = new Date(Date.now() + (isStripeCheckout ? 30 : 15) * 60 * 1000);

  const payment = await getPaymentForBooking(db, bookingId);
  const paymentData = {
    bookingId,
    parentId: booking.parentId,
    teacherId: booking.teacherId,
    studentName: booking.studentName || '',
    courseTitle: booking.courseTitle || '',
    amount,
    fees,
    netAmount,
    currency: 'THB',
    method,
    provider: paymentProvider,
    status: 'pending',
    kind: 'session',
    couponCode: couponCode || null,
    couponId,
    discountAmount: discount,
    walletApplied,
    walletDeducted: false,
    couponConsumed: false,
    providerRef: null,
    slipURL: null,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: FieldValue.serverTimestamp(),
  } as const;

  let paymentId: string;
  if (payment) {
    paymentId = payment.id;
    await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update(paymentData);
  } else {
    const paymentRef = await db.collection(COLLECTIONS.PAYMENTS).add({
      ...paymentData,
      escrowProcessed: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    paymentId = paymentRef.id;
  }

  let checkoutUrl: string | null = null;
  let providerRef: string | null = null;
  let qrDataUrl: string | null = null;
  let bankDetails: { bankName: string; accountName: string; accountNumber: string; ref: string } | null = null;

  try {
    if (isStripeCheckout) {
      const checkout = await createStripeCheckoutSession({
        amount,
        bookingId,
        paymentId,
        courseTitle: booking.courseTitle || '',
        studentName: booking.studentName || '',
      });
      checkoutUrl = checkout.url;
      providerRef = checkout.id;
    } else if (method === 'bank_transfer') {
      bankDetails = { ...BANK_ACCOUNT, ref };
      providerRef = `manual_${ref}`;
    } else if (method === 'stripe_checkout') {
      providerRef = `mock_${ref}`;
      qrDataUrl = await generateQRDataUrl(buildMockPromptPayPayload({
        ref,
        amount,
        number: PROMPTPAY_NUMBER,
      }));
    }
  } catch (error) {
    console.error('Stripe checkout creation failed:', error instanceof Error ? error.message : 'unknown error');
    await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
      status: 'failed',
      note: 'payment_session_creation_failed',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ error: 'gateway_error' }, { status: 502 });
  }

  await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
    providerRef,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    paymentId,
    mode: provider,
    method,
    gross,
    discount,
    walletApplied,
    couponCode: couponCode || null,
    checkoutUrl,
    qrDataUrl,
    bankDetails,
    promptpay: { number: PROMPTPAY_NUMBER, owner: PROMPTPAY_OWNER },
    expiresAt: expiresAt.toISOString(),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
