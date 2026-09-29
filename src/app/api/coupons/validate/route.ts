import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { validateCoupon } from '@/lib/coupons';

// POST /api/coupons/validate { code, amount }
// Server-only coupon check — client never reads coupon docs (rules deny all).
// Returns the discount or a reason code; does not consume the coupon
// (consumption happens atomically at booking creation / payment paid).
// NOTE: usageLimit/usedCount is enforced server-side inside validateCoupon() —
// clients must never be trusted to self-validate remaining uses.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { code?: string; amount?: number };
  const code = String(body.code || '').trim().toUpperCase().slice(0, 32);
  const amount = Number(body.amount) || 0;
  if (!code) return NextResponse.json({ error: 'missing_code' }, { status: 400 });

  const check = await validateCoupon(db, code, amount, session.uid);
  if (!check.ok) {
    return NextResponse.json(
      { ok: false, reason: check.reason, minAmount: (check as any).minAmount },
    );
  }
  return NextResponse.json({ ok: true, discount: check.discount, kind: check.coupon.kind, value: check.coupon.value });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
