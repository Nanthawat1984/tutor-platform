import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  const storage = getServerStorage();
  if (!db || !storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const adminSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const paymentSnap = await db.collection(COLLECTIONS.PAYMENTS).doc(id).get();
  if (!paymentSnap.exists) return NextResponse.json({ error: 'payment_not_found' }, { status: 404 });

  const payment = paymentSnap.data() as { method?: string; slipPath?: string };
  if (payment.method !== 'bank_transfer' || !payment.slipPath?.startsWith(`payment-slips/`)) {
    return NextResponse.json({ error: 'slip_not_available' }, { status: 404 });
  }

  try {
    const fileRef = storage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`).file(payment.slipPath);
    const [exists] = await fileRef.exists();
    if (!exists) return NextResponse.json({ error: 'slip_not_found' }, { status: 404 });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Admin payment slip view error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'slip_view_failed' }, { status: 500 });
  }
}
