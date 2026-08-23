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

const VALID_METHODS = PAYMENT_METHODS.map((method) => method.id) as PaymentMethod[];

function normalizeMethod(value: unknown): PaymentMethod | null {
  if (value === 'promptpay' || value === 'credit_card') return 'stripe_checkout';
  return typeof value === 'string' && VALID_METHODS.includes(value as PaymentMethod)
    ? value as PaymentMethod
    : null;
}

/**
 * POST /api/payments/initiate
 * Body: { bookingId, method }
 * Stripe Checkout handles card/PromptPay; bank transfer and Mock remain available.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : '';
  const method = normalizeMethod(body.method);
  if (!bookingId) return NextResponse.json({ error: 'missing_booking_id' }, { status: 400 });
  if (!method) return NextResponse.json({ error: 'invalid_method' }, { status: 400 });

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) return NextResponse.json({ error: 'booking_not_found' }, { status: 404 });
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (booking.status !== 'pending') return NextResponse.json({ error: 'booking_not_payable' }, { status: 409 });

  const amount = Number(booking.totalPrice) || 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'invalid_payment_amount' }, { status: 422 });
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
    checkoutUrl,
    qrDataUrl,
    bankDetails,
    promptpay: { number: PROMPTPAY_NUMBER, owner: PROMPTPAY_OWNER },
    expiresAt: expiresAt.toISOString(),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
