import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { requireRole } from '@/lib/auth/guards';
import { COLLECTIONS } from '@/types/firestore';
import { getStripeConnectMode, retrieveStripeConnectAccount } from '@/lib/payments/connect';

export async function GET() {
  const { session, db } = await requireRole(['teacher']);
  const mode = getStripeConnectMode();
  const userRef = db.collection(COLLECTIONS.USERS).doc(session.uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() as any : {};
  if (!user.stripeConnectAccountId) {
    return NextResponse.json({ enabled: mode === 'test' || mode === 'live', mode, status: null });
  }

  try {
    const status = await retrieveStripeConnectAccount(user.stripeConnectAccountId);
    await userRef.set({
      stripeConnectStatus: status.transfersStatus || 'pending',
      stripeConnectTransfersStatus: status.transfersStatus,
      stripeConnectPayoutsStatus: status.payoutsStatus,
      stripeConnectUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ enabled: mode === 'test' || mode === 'live', mode, status });
  } catch {
    return NextResponse.json({ error: 'connect_status_unavailable' }, { status: 502 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
