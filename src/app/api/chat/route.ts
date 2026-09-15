import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { CHAT_COLLECTION, CHAT_MAX_LENGTH } from '@/types/chat';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';

async function assertParty(db: any, bookingId: string, uid: string) {
  const snap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) return null;
  const b = snap.data() as any;
  if (b.parentId !== uid && b.teacherId !== uid) return null;
  return b;
}

// GET /api/chat?bookingId= — list messages (oldest first, max 100).
// POST /api/chat { bookingId, text } — send (20 msg/hour per user).
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const bookingId = new URL(request.url).searchParams.get('bookingId') || '';
  if (!bookingId) return NextResponse.json({ error: 'missing_booking_id' }, { status: 400 });
  const booking = await assertParty(db, bookingId, session.uid);
  if (!booking) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const snap = await db.collection(CHAT_COLLECTION)
    .where('bookingId', '==', bookingId)
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();
  return NextResponse.json({
    ok: true,
    items: snap.docs.map((d: any) => {
      const m = d.data();
      return {
        id: d.id,
        senderId: m.senderId,
        senderRole: m.senderRole,
        text: m.text,
        mine: m.senderId === session.uid,
        createdAt: m.createdAt?.toMillis?.() || null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  sweepRateLimitBuckets();
  const limit = checkRateLimit(`chat:${session.uid}`, 20, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const body = await request.json().catch(() => ({})) as { bookingId?: string; text?: string };
  const bookingId = String(body.bookingId || '').trim();
  const text = String(body.text || '').trim().slice(0, CHAT_MAX_LENGTH);
  if (!bookingId || !text) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const booking = await assertParty(db, bookingId, session.uid);
  if (!booking) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const role = userSnap.data()?.role === 'teacher' ? 'teacher' : 'parent';

  const ref = await db.collection(CHAT_COLLECTION).add({
    bookingId,
    senderId: session.uid,
    senderRole: role,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Notify the other party in-app (best effort).
  try {
    const otherId = role === 'teacher' ? booking.parentId : booking.teacherId;
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: otherId,
      type: 'booking',
      title: 'ข้อความใหม่',
      body: `${booking.studentName || 'นักเรียน'} (${booking.courseTitle || 'คอร์ส'}): ${text.slice(0, 80)}`,
      data: { bookingId },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logEvent('warn', 'chat_notify_failed', { bookingId });
  }

  return NextResponse.json({ ok: true, id: ref.id });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
