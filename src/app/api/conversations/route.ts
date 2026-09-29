import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { CONVERSATIONS_COLLECTION } from '@/types/chat';
import {
  bookingContextLabel,
  getOrCreateConversation,
  toSummary,
} from '@/lib/chat/conversations';
import { logEvent } from '@/lib/log';

// GET  /api/conversations — ห้องคุยทั้งหมดของผู้ใช้ (ใหม่สุดก่อน)
// POST /api/conversations { teacherId, bookingId? } — เปิดห้องคุยกับครู (idempotent)
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  if (session.role === 'admin') return NextResponse.json({ ok: true, items: [] });

  try {
    const snap = await db.collection(CONVERSATIONS_COLLECTION)
      .where('participantIds', 'array-contains', session.uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(50)
      .get();

    return NextResponse.json({
      ok: true,
      items: snap.docs.map((d: any) => toSummary({ id: d.id, ...d.data() } as any, session.uid)),
    });
  } catch (error: any) {
    logEvent('error', 'conversations_list_failed', { code: error?.code });
    return NextResponse.json(
      { error: error?.code === 9 ? 'index_building' : 'list_failed' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  if (session.role !== 'parent') {
    return NextResponse.json({ error: 'parents_only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { teacherId?: string; bookingId?: string };
  const teacherId = String(body.teacherId || '').trim();
  if (!teacherId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  if (teacherId === session.uid) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const teacherSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  if (!teacherSnap.exists || teacherSnap.data()?.role !== 'teacher') {
    return NextResponse.json({ error: 'teacher_not_found' }, { status: 404 });
  }

  // ถ้ามาจากหน้าการจอง — ผูกห้องคุยเข้ากับ booking นั้นเพื่อให้เห็นบริบท
  let bookingId: string | null = null;
  let contextLabel: string | null = null;
  const requestedBookingId = String(body.bookingId || '').trim();
  if (requestedBookingId) {
    const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(requestedBookingId).get();
    const booking = bookingSnap.exists ? (bookingSnap.data() as any) : null;
    if (!booking || booking.parentId !== session.uid || booking.teacherId !== teacherId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    bookingId = bookingSnap.id;
    contextLabel = bookingContextLabel(booking);
  }

  const { conversation, created } = await getOrCreateConversation(db, {
    parentId: session.uid,
    teacherId,
    bookingId,
    contextLabel,
  });

  return NextResponse.json({
    ok: true,
    created,
    conversation: toSummary(conversation, session.uid),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
