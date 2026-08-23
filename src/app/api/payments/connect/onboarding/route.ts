import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { requireRole } from '@/lib/auth/guards';
import { COLLECTIONS } from '@/types/firestore';
import {
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  getStripeConnectMode,
  retrieveStripeConnectAccount,
} from '@/lib/payments/connect';

export async function POST() {
  const { session, db } = await requireRole(['teacher']);
  const mode = getStripeConnectMode();
  if (mode === 'disabled') return NextResponse.json({ error: 'connect_disabled' }, { status: 409 });
  if (mode === 'locked') return NextResponse.json({ error: 'connect_locked' }, { status: 409 });

  const userRef = db.collection(COLLECTIONS.USERS).doc(session.uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() as any : {};

  try {
    const status = user.stripeConnectAccountId
      ? await retrieveStripeConnectAccount(user.stripeConnectAccountId)
      : await createStripeConnectAccount({
          uid: session.uid,
          email: session.email,
          displayName: session.displayName,
        });
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const returnUrl = `${appUrl}/profile/payout?connect=complete`;
    const refreshUrl = `${appUrl}/profile/payout?connect=refresh`;
    const onboardingUrl = await createStripeConnectOnboardingLink({
      accountId: status.accountId,
      returnUrl,
      refreshUrl,
    });

    await userRef.set({
      stripeConnectAccountId: status.accountId,
      stripeConnectStatus: status.transfersStatus || 'pending',
      stripeConnectTransfersStatus: status.transfersStatus,
      stripeConnectPayoutsStatus: status.payoutsStatus,
      stripeConnectUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, onboardingUrl, status });
  } catch (error) {
    console.error('Stripe Connect onboarding failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'connect_onboarding_failed' }, { status: 502 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
