import { POST as stripeWebhookPost } from '../stripe-webhook/route';

// Backward-compatible webhook URL. Configure Stripe to use this endpoint or
// the explicit `/api/payments/stripe-webhook` route.
export const POST = stripeWebhookPost;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
