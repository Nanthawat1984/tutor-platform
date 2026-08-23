import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { markPaymentExpired, markPaymentFailed, markPaymentPaid, refundPayment } from '@/lib/payments/process';
import { constructStripeWebhookEvent } from '@/lib/payments/stripe';

export async function POST(request: NextRequest) {
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const rawBody = await request.text();
  let event;
  try {
    event = constructStripeWebhookEvent(rawBody, request.headers.get('stripe-signature'));
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const eventRef = db.collection(COLLECTIONS.STRIPE_EVENTS).doc(event.id);
  try {
    await eventRef.create({
      type: event.type,
      status: 'processing',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const data = event.data.object as Record<string, any>;
    const paymentId = await findPaymentId(db, data);

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'payment_intent.succeeded':
        if (paymentId && (event.type !== 'checkout.session.completed' || data.payment_status === 'paid')) {
          await markPaymentPaid(db, paymentId, {
            transactionId: data.payment_intent || data.id,
            providerRef: data.id || null,
          });
        }
        break;
      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed':
        if (paymentId) await markPaymentFailed(db, paymentId, 'stripe_payment_failed');
        break;
      case 'checkout.session.expired':
        if (paymentId) {
          await markPaymentExpired(db, paymentId, { providerRef: data.id });
        }
        break;
      case 'charge.refunded':
        if (paymentId) await refundPayment(db, paymentId);
        break;
      case 'charge.dispute.created':
        if (paymentId) {
          await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
            note: 'stripe_dispute_created',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      default:
        break;
    }

    await eventRef.update({ status: 'processed', processedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ received: true });
  } catch (error) {
    await eventRef.delete().catch(() => undefined);
    console.error('Stripe webhook processing failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}

async function findPaymentId(db: Firestore, data: Record<string, any>): Promise<string | null> {
  const metadataPaymentId = typeof data.metadata?.payment_id === 'string' ? data.metadata.payment_id : null;
  if (metadataPaymentId) return metadataPaymentId;

  const providerRef = typeof data.id === 'string' ? data.id : null;
  if (!providerRef) return null;
  const snap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('providerRef', '==', providerRef)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
