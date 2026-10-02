import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { fileBookingDispute } from '@/lib/booking-actions';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';

// PUT /api/bookings/[id]/dispute { reason, note? } — เปิดข้อพิพาทเมื่อไม่เห็นด้วย
// (เคยอยู่เป็น PUT ใน cancel/route.ts ซึ่งไม่มีทางถูกเรียกถูก — UAT จับได้ว่า 404)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 5 ครั้ง / 10 นาที ต่อผู้ใช้ — เปิดข้อพิพาทไม่ควรยิงรัว (fail-open ถ้า limiter พัง)
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`booking_dispute:${session.uid}`, 5, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { reason?: string; note?: string };
  const userSnap = await db.collection('users').doc(session.uid).get();
  const role = userSnap.data()?.role === 'teacher' ? 'teacher' : 'parent';

  const result = await fileBookingDispute(db, {
    bookingId: id,
    uid: session.uid,
    actorRole: role as 'parent' | 'teacher',
    reason: String(body.reason || ''),
    note: typeof body.note === 'string' ? body.note : undefined,
  });
  if (!result.ok) {
    const status = result.error === 'forbidden' || result.error === 'not_found' ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
