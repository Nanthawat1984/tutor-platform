import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { cancelBooking } from '@/lib/booking-actions';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';

// POST /api/bookings/[id]/cancel { reason? } — ยกเลิก self-service, เงินคืนเข้าวอลเล็ต
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 10 ครั้ง / 10 นาที ต่อผู้ใช้ — กันยิงรัวยกเลิกจองเพื่อรีเฟรชเครดิต (fail-open ถ้า limiter พัง)
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`booking_cancel:${session.uid}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { reason?: string };
  const userSnap = await db.collection('users').doc(session.uid).get();
  const role = userSnap.data()?.role === 'teacher' ? 'teacher' : 'parent';

  const result = await cancelBooking(db, {
    bookingId: id,
    uid: session.uid,
    actorRole: role as 'parent' | 'teacher',
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
  });
  if (!result.ok) {
    const status = result.error === 'forbidden' || result.error === 'not_found' ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, refunded: result.refunded ?? 0 });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
