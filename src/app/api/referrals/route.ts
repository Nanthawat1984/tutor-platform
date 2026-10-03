import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { claimReferral, getReferralSummary } from '@/lib/referrals';
import { logEvent } from '@/lib/log';

// GET  /api/referrals — โค้ดของฉัน + สถิติคนที่ชวนมา
// POST /api/referrals { code } — ใช้โค้ดของเพื่อน (ได้ครั้งเดียวต่อคน)
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const summary = await getReferralSummary(db, session.uid);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 10 ครั้ง / 10 นาที ต่อผู้ใช้ — กันยิงรัว claim โค้ดแนะนำ (fail-open ถ้า limiter พัง)
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`referral_claim:${session.uid}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { code?: string };
  const result = await claimReferral(db, {
    uid: session.uid,
    email: session.email,
    code: String(body.code || ''),
  });

  if (!result.ok) {
    const status = result.reason === 'already_claimed' ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  logEvent('info', 'referral_claimed', { uid: session.uid });
  return NextResponse.json({ ok: true, id: result.id, code: result.code });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';