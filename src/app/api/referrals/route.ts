import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/referrals/me — my referral code + reward status.
// POST /api/referrals/claim { code } — claim a referral at signup/first booking.
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const mine = await db.collection('referrals').where('referrerId', '==', session.uid).limit(50).get();
  const code = `TF-${session.uid.slice(0, 6).toUpperCase()}`;
  return NextResponse.json({
    ok: true,
    code,
    total: mine.size,
    rewarded: mine.docs.filter((d: any) => d.data().status === 'rewarded').length,
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { code?: string };
  const code = String(body.code || '').trim().toUpperCase().slice(0, 16);
  if (!code || !code.startsWith('TF-')) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  if (code === `TF-${session.uid.slice(0, 6).toUpperCase()}`) {
    return NextResponse.json({ error: 'self_referral' }, { status: 400 });
  }

  const existing = await db.collection('referrals')
    .where('referredEmail', '==', session.email)
    .limit(1)
    .get();
  if (!existing.empty) return NextResponse.json({ error: 'already_claimed' }, { status: 409 });

  const ref = await db.collection('referrals').add({
    referrerId: code,
    referredEmail: session.email,
    referredUid: session.uid,
    code,
    status: 'pending',
    rewardAmount: 100,
    createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, id: ref.id });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
