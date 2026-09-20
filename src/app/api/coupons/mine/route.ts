import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { ensureFirstBookingCoupon, validateCoupon } from '@/lib/coupons';

// GET /api/coupons/mine — คูปองลูกค้าใหม่ของฉัน (ออกให้อัตโนมัติถ้ายังไม่มี)
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const coupon = await ensureFirstBookingCoupon(db, session.uid);
  if (!coupon) return NextResponse.json({ ok: true, coupon: null });
  const check = await validateCoupon(db, coupon.code, 1_000_000, session.uid);
  return NextResponse.json({
    ok: true,
    coupon: check.ok
      ? { code: coupon.code, kind: check.coupon.kind, value: check.coupon.value, minAmount: check.coupon.minAmount }
      : null,
    reason: check.ok ? undefined : (check as any).reason,
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
