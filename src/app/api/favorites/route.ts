import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';

// รายการโปรดครู — เอกสารส่วนตัวของผู้ปกครอง
// ทุก query กรองด้วย parentId ของผู้เรียกเอง (ไม่เชื่อ role จาก token) และ
// doc id = `${parentId}_${teacherId}` เพื่อให้กดซ้ำ idempotent
//
// GET  /api/favorites — รายการครูที่ฉันกดหัวใจ
// POST /api/favorites { teacherId, favorite } — true = เพิ่ม, false = เอาออก

function favoriteId(parentId: string, teacherId: string) {
  return `${parentId}_${teacherId}`;
}

async function requireParent() {
  const session = await getSessionUser();
  if (!session) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const db = getServerDb();
  if (!db) return { error: NextResponse.json({ error: 'server_not_configured' }, { status: 500 }) };
  const callerSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'parent') {
    return { error: NextResponse.json({ error: 'parents_only' }, { status: 403 }) };
  }
  return { session, db };
}

export async function GET() {
  const auth = await requireParent();
  if ('error' in auth) return auth.error;
  const { session, db } = auth;

  const snap = await db.collection(COLLECTIONS.PARENT_FAVORITES)
    .where('parentId', '==', session.uid)
    .limit(100)
    .get();

  const items = snap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      teacherId: data.teacherId,
      teacherName: data.teacherName || null,
      createdAt: data.createdAt?.toMillis?.() || null,
    };
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const auth = await requireParent();
  if ('error' in auth) return auth.error;
  const { session, db } = auth;

  // 60 ครั้ง / 10 นาที ต่อผู้ใช้ — กันยิงรัวสร้าง/ลบรายการ (fail-open ถ้า limiter พัง)
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`favorites:${session.uid}`, 60, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const body = await request.json().catch(() => ({})) as { teacherId?: string; favorite?: boolean };
  const teacherId = String(body.teacherId || '').trim();
  const favorite = body.favorite !== false;
  if (!teacherId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  if (teacherId === session.uid) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const teacherSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  if (!teacherSnap.exists || teacherSnap.data()?.role !== 'teacher') {
    return NextResponse.json({ error: 'teacher_not_found' }, { status: 404 });
  }

  const ref = db.collection(COLLECTIONS.PARENT_FAVORITES).doc(favoriteId(session.uid, teacherId));

  if (!favorite) {
    const existing = await ref.get();
    if (existing.exists) {
      await ref.delete();
    }
    return NextResponse.json({ ok: true, favorite: false });
  }

  const teacherName = (teacherSnap.data() as any)?.displayName || null;
  const existing = await ref.get();
  if (existing.exists) {
    // กดซ้ำ = ไม่ต้องเขียนซ้ำ (และไม่ทำให้ createdAt ใหม่)
    return NextResponse.json({ ok: true, favorite: true });
  }
  await ref.set({
    parentId: session.uid,
    teacherId,
    teacherName,
    createdAt: FieldValue.serverTimestamp(),
  });
  logEvent('info', 'parent_favorite_added', { uid: session.uid, teacherId });

  return NextResponse.json({ ok: true, favorite: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';