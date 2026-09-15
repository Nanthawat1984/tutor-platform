import { NextResponse } from 'next/server';

// GET /api/health — shallow liveness/readiness probe for monitoring.
// Reports build version and which integrations are configured (booleans only,
// never secrets). Does not touch Firestore so the probe stays fast and cannot
// cascade-fail when the database is slow.
export async function GET() {
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  );
  return NextResponse.json({
    ok: true,
    service: 'tutor-platform',
    version: process.env.npm_package_version || '0.1.0',
    at: new Date().toISOString(),
    integrations: {
      paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
      stripeConfigured,
      lineNotificationsEnabled: process.env.LINE_NOTIFICATIONS_ENABLED === 'true',
      slipAgentEnabled: process.env.PAYMENT_SLIP_AGENT_ENABLED === 'true',
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
