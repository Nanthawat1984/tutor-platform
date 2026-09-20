import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// GET /api/wallet — ยอดเครดิต + ประวัติของฉัน
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const walletSnap = await db.collection(COLLECTIONS.PARENT_WALLETS).doc(session.uid).get();
  const wallet = walletSnap.exists
    ? walletSnap.data()
    : { balance: 0, totalCredited: 0, totalSpent: 0 };

  const txSnap = await db.collection(COLLECTIONS.PARENT_WALLET_TXS)
    .where('parentId', '==', session.uid)
    .limit(50)
    .get();
  const txs = txSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  return NextResponse.json({
    ok: true,
    wallet: {
      balance: Number((wallet as any)?.balance) || 0,
      totalCredited: Number((wallet as any)?.totalCredited) || 0,
      totalSpent: Number((wallet as any)?.totalSpent) || 0,
    },
    transactions: txs.map((t: any) => ({
      id: t.id,
      kind: t.kind,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      note: t.note,
      bookingId: t.bookingId,
      createdAt: t.createdAt?.toMillis?.() || null,
    })),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
