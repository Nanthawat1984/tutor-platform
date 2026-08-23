import crypto from 'node:crypto';
import type Stripe from 'stripe';

type StripeConstructor = typeof import('stripe').default;

function loadStripeConstructor(): StripeConstructor {
  const stripeModule = require('stripe') as { default?: StripeConstructor };
  return stripeModule.default || stripeModule as unknown as StripeConstructor;
}

let stripeClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  stripeClient = secretKey
    ? new (loadStripeConstructor())(secretKey, { apiVersion: '2026-07-29.dahlia' })
    : null;
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeClient());
}

export function createStripeIntegrationIdentifier(): string {
  return `tutorfinder_${crypto.randomBytes(8).toString('hex').slice(0, 8)}`;
}

export async function createStripeCheckoutSession(opts: {
  amount: number;
  bookingId: string;
  paymentId: string;
  courseTitle: string;
  studentName: string;
  appUrl?: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');

  const amountInSatang = Math.round(opts.amount * 100);
  if (!Number.isInteger(amountInSatang) || amountInSatang <= 0) {
    throw new Error('Payment amount must be a positive THB amount');
  }

  const appUrl = (opts.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const bookingPath = `/bookings/${encodeURIComponent(opts.bookingId)}/payment`;
  const successPath = `${bookingPath}/success?paymentId=${encodeURIComponent(opts.paymentId)}&session_id={CHECKOUT_SESSION_ID}`;

  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'thb',
        unit_amount: amountInSatang,
        product_data: {
          name: `ค่าเรียน ${opts.courseTitle || 'TutorFinder'}`,
          description: opts.studentName ? `นักเรียน: ${opts.studentName}` : undefined,
        },
      },
      quantity: 1,
    }],
    success_url: `${appUrl}${successPath}`,
    cancel_url: `${appUrl}${bookingPath}?paymentId=${encodeURIComponent(opts.paymentId)}&cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      booking_id: opts.bookingId,
      payment_id: opts.paymentId,
    },
    payment_intent_data: {
      metadata: {
        booking_id: opts.bookingId,
        payment_id: opts.paymentId,
      },
    },
    integration_identifier: createStripeIntegrationIdentifier(),
  });
}

export function constructStripeWebhookEvent(
  rawBody: string,
  signature: string | null,
): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret || !signature) {
    throw new Error('Stripe webhook is not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
