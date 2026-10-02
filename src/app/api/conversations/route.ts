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
// POST /api/conversations { teacherId | parentId, bookingId? } — เปิดห้องคุย (idempotent)
// ผู้ปกครองส่ง teacherId, ครูส่ง parentId (ครูเปิดกับผู้ปกครองที่เคยจองด้วยกันได้เท่านั้น)
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  // กรองด้วย participantIds ของผู้เรียกเอง ไม่ต้องเชื่อ role ใน token
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

  // ⚠️ อย่าเชื่อ session.role — มาจาก custom claim ใน token ซึ่งบัญชีที่สมัครด้วย
  // email/password จะไม่มี claim นี้ และ getSessionUser() ตั้ง fallback เป็น 'parent'
  // ต้องอ่าน role จาก users doc เหมือน requireRole()
  const callerSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const callerRole = callerSnap.data()?.role;
  if (callerRole !== 'parent' && callerRole !== 'teacher') {
    return NextResponse.json({ error: 'forbidden_party' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    teacherId?: string;
    parentId?: string;
    bookingId?: string;
  };

  // ฝั่งผู้ปกครองเปิดห้องกับครู / ฝั่งครูเปิดห้องกับผู้ปกครอง
  let parentId = session.uid;
  let teacherId = session.uid;
  if (callerRole === 'parent') {
    teacherId = String(body.teacherId || '').trim();
    if (!teacherId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    if (teacherId === session.uid) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    const teacherSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
    if (!teacherSnap.exists || teacherSnap.data()?.role !== 'teacher') {
      return NextResponse.json({ error: 'teacher_not_found' }, { status: 404 });
    }
  } else {
    parentId = String(body.parentId || '').trim();
    if (!parentId || parentId === session.uid) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    // ครูทักผู้ปกครองได้เฉพาะคนที่เคยมีการจองด้วยกันเท่านั้น
    // (ป้องกันการใช้แชทเป็นช่องทางติดต่อผู้ปกครองอื่น)
    const sharedSnap = await db.collection(COLLECTIONS.BOOKINGS)
      .where('teacherId', '==', session.uid)
      .where('parentId', '==', parentId)
      .limit(1)
      .get();
    if (sharedSnap.empty) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ถ้ามาจากหน้าการจอง — ผูกห้องคุยเข้ากับ booking นั้นเพื่อให้เห็นบริบท
  let bookingId: string | null = null;
  let contextLabel: string | null = null;
  const requestedBookingId = String(body.bookingId || '').trim();
  if (requestedBookingId) {
    const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(requestedBookingId).get();
    const booking = bookingSnap.exists ? (bookingSnap.data() as any) : null;
    if (!booking || booking.parentId !== parentId || booking.teacherId !== teacherId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    bookingId = bookingSnap.id;
    contextLabel = bookingContextLabel(booking);
  }

  const { conversation, created } = await getOrCreateConversation(db, {
    parentId,
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
