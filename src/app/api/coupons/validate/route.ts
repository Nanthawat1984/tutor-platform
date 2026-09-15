import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// POST /api/coupons/validate { code, amount }
// Server-only coupon check — client never reads coupon docs (rules deny all).
// Returns the discount or a reason code; does not consume the coupon
// (consumption happens atomically at booking creation).
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { code?: string; amount?: number };
  const code = String(body.code || '').trim().toUpperCase().slice(0, 32);
  const amount = Number(body.amount) || 0;
  if (!code) return NextResponse.json({ error: 'missing_code' }, { status: 400 });

  const snap = await db.collection('coupons').where('code', '==', code).limit(1).get();
  if (snap.empty) return NextResponse.json({ ok: false, reason: 'not_found' });
  const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;

  if (coupon.isActive !== true) return NextResponse.json({ ok: false, reason: 'inactive' });
  const expiresMs = coupon.expiresAt?.toMillis?.() || 0;
  if (expiresMs && expiresMs < Date.now()) return NextResponse.json({ ok: false, reason: 'expired' });
  if (typeof coupon.usageLimit === 'number' && (coupon.usedCount || 0) >= coupon.usageLimit) {
    return NextResponse.json({ ok: false, reason: 'exhausted' });
  }
  if (typeof coupon.minAmount === 'number' && amount < coupon.minAmount) {
    return NextResponse.json({ ok: false, reason: 'min_amount', minAmount: coupon.minAmount });
  }

  let discount = 0;
  if (coupon.kind === 'percent') {
    discount = Math.floor((amount * (Number(coupon.value) || 0)) / 100);
    if (typeof coupon.maxDiscount === 'number') discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = Number(coupon.value) || 0;
  }
  discount = Math.max(0, Math.min(discount, amount));

  return NextResponse.json({ ok: true, discount, kind: coupon.kind, value: coupon.value });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
