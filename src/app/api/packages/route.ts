import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// GET /api/packages?courseId= / ?teacherId= — แพ็กเกจที่เปิดขาย
export async function GET(request: Request) {
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const q = new URL(request.url).searchParams;
  const courseId = q.get('courseId') || '';
  const teacherId = q.get('teacherId') || '';

  let snap;
  if (courseId) {
    snap = await db.collection(COLLECTIONS.PACKAGES)
      .where('courseId', '==', courseId)
      .where('isActive', '==', true)
      .limit(20)
      .get();
  } else if (teacherId) {
    snap = await db.collection(COLLECTIONS.PACKAGES)
      .where('teacherId', '==', teacherId)
      .where('isActive', '==', true)
      .limit(20)
      .get();
  } else {
    snap = await db.collection(COLLECTIONS.PACKAGES)
      .where('isActive', '==', true)
      .limit(50)
      .get();
  }

  const items = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .map((p: any) => ({
      id: p.id,
      teacherId: p.teacherId,
      teacherName: p.teacherName,
      courseId: p.courseId,
      courseTitle: p.courseTitle,
      title: p.title,
      sessionsTotal: p.sessionsTotal,
      priceTotal: p.priceTotal,
      pricePerSession: p.sessionsTotal > 0 ? Math.round((Number(p.priceTotal) || 0) / p.sessionsTotal) : 0,
      discountPercent: p.discountPercent || 0,
      singlePricePerSession: null as number | null,
    }));

  // เติมราคาเดี่ยวเพื่อโชว์ส่วนลด
  const courseIds = Array.from(new Set(items.map((i: any) => i.courseId).filter(Boolean)));
  if (courseIds.length) {
    const snaps = await db.getAll(...courseIds.map((id) => db.collection(COLLECTIONS.COURSES).doc(id as string)));
    const priceByCourse = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, Number(s.data()?.pricePerSession) || 0]));
    items.forEach((i: any) => {
      const single = priceByCourse.get(i.courseId) || 0;
      i.singlePricePerSession = single;
    });
  }

  return NextResponse.json({ ok: true, items });
}

// POST /api/packages { courseId, title, sessionsTotal, priceTotal } — ครูสร้างแพ็กเกจของตัวเอง
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as {
    courseId?: string; title?: string; sessionsTotal?: number; priceTotal?: number;
  };
  const courseId = String(body.courseId || '').trim();
  const title = String(body.title || '').trim().slice(0, 120);
  const sessionsTotal = Math.round(Number(body.sessionsTotal) || 0);
  const priceTotal = Math.round(Number(body.priceTotal) || 0);
  if (!courseId || !title || sessionsTotal < 2 || sessionsTotal > 50 || priceTotal <= 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(courseId).get();
  if (!courseSnap.exists) return NextResponse.json({ error: 'course_not_found' }, { status: 404 });
  const course = courseSnap.data() as any;
  if (course.teacherId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const singlePrice = Number(course.pricePerSession) || 0;
  const listTotal = singlePrice * sessionsTotal;
  const discountPercent = listTotal > 0
    ? Math.max(0, Math.round(((listTotal - priceTotal) / listTotal) * 100))
    : 0;
  if (priceTotal >= listTotal) {
    return NextResponse.json({ error: 'no_discount', listTotal }, { status: 422 });
  }

  const ref = await db.collection(COLLECTIONS.PACKAGES).add({
    teacherId: session.uid,
    teacherName: course.teacherName || session.displayName,
    courseId,
    courseTitle: course.title,
    title,
    sessionsTotal,
    priceTotal,
    priceCurrency: 'THB',
    discountPercent,
    isActive: true,
    soldCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, id: ref.id, discountPercent });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
