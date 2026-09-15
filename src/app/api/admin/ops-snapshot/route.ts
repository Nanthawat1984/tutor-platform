import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// GET /api/admin/ops-snapshot — one JSON snapshot of queues an admin must watch.
// Admin-only. Counts only (no PII, no document bodies) so it stays cheap and
// safe to poll from a status dashboard or uptime monitor with an admin token.
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const adminSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [
    awaitingReview,
    paidUnreleased,
    payoutRequested,
    payoutProcessing,
    failedWebhooks,
    failedOutbox,
  ] = await Promise.all([
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'awaiting_review').count().get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').count().get(),
    db.collection(COLLECTIONS.PAYOUTS).where('status', '==', 'requested').count().get(),
    db.collection(COLLECTIONS.PAYOUTS).where('status', '==', 'processing').count().get(),
    db.collection(COLLECTIONS.STRIPE_EVENTS).where('status', '==', 'processing').count().get(),
    db.collection('lineNotificationOutbox').where('status', '==', 'failed').count().get(),
  ]);

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    queues: {
      paymentsAwaitingReview: awaitingReview.data().count,
      paymentsPaid: paidUnreleased.data().count,
      payoutsRequested: payoutRequested.data().count,
      payoutsProcessing: payoutProcessing.data().count,
      stripeEventsProcessing: failedWebhooks.data().count,
      lineOutboxFailed: failedOutbox.data().count,
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
