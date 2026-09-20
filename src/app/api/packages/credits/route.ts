import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import {
  buildAvailableBookingSlots,
  validateBookingSlot,
  type AvailabilityBooking,
  type AvailabilitySchedule,
} from '@/lib/booking/availability';
import { consumePackageCredit } from '@/lib/packages';

// GET /api/packages/credits — เครดิตแพ็กเกจคงเหลือของฉัน (+slot ว่างสำหรับจองต่อ)
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const purchaseId = new URL(request.url).searchParams.get('purchaseId') || '';
  const q = db.collection(COLLECTIONS.PACKAGE_PURCHASES).where('parentId', '==', session.uid);
  const snap = purchaseId
    ? await db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId).get().then((s) => ({ docs: s.exists ? [s] : [] }) as any)
    : await q.limit(50).get();

  const purchases = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((p: any) => !purchaseId || p.parentId === session.uid)
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  return NextResponse.json({
    ok: true,
    items: purchases.map((p: any) => ({
      id: p.id,
      packageId: p.packageId,
      packageTitle: p.packageTitle,
      teacherId: p.teacherId,
      courseId: p.courseId,
      courseTitle: p.courseTitle,
      studentId: p.studentId,
      studentName: p.studentName,
      sessionsTotal: p.sessionsTotal,
      sessionsUsed: p.sessionsUsed,
      sessionsRemaining: p.sessionsRemaining,
      status: p.status,
    })),
  });
}

// POST /api/packages/credits { purchaseId, slot: { scheduleId, date, startTime, endTime }, studentId? }
// จองด้วยเครดิตแพ็กเกจ — ไม่สร้าง payment ใหม่, หักเครดิต 1 ครั้ง, booking=confirmed ทันที
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as {
    purchaseId?: string; slot?: { scheduleId?: string; date?: string; startTime?: string; endTime?: string }; studentId?: string;
  };
  const purchaseId = String(body.purchaseId || '').trim();
  const slot = body.slot || {};
  if (!purchaseId || !slot.scheduleId || !slot.date || !slot.startTime || !slot.endTime) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const purchaseSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId).get();
  if (!purchaseSnap.exists) return NextResponse.json({ error: 'purchase_not_found' }, { status: 404 });
  const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as any;
  if (purchase.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (purchase.status !== 'active' || Number(purchase.sessionsRemaining) < 1) {
    return NextResponse.json({ error: 'insufficient_credit' }, { status: 409 });
  }

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(purchase.courseId).get();
  if (!courseSnap.exists) return NextResponse.json({ error: 'course_not_found' }, { status: 404 });
  const course = { id: courseSnap.id, ...courseSnap.data() } as any;
  if (course.isActive !== true) return NextResponse.json({ error: 'course_inactive' }, { status: 409 });

  const scheduleSnap = await db.collection(COLLECTIONS.SCHEDULES).doc(String(slot.scheduleId)).get();
  const schedule = scheduleSnap.exists
    ? ({ id: scheduleSnap.id, ...scheduleSnap.data() } as AvailabilitySchedule)
    : null;
  if (!schedule || schedule.courseId !== purchase.courseId) {
    return NextResponse.json({ error: 'slot_unavailable' }, { status: 409 });
  }

  const conflictsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', purchase.teacherId)
    .where('bookingDate', '==', slot.date)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  const validation = validateBookingSlot({
    schedule,
    bookingDate: String(slot.date),
    startTime: String(slot.startTime),
    endTime: String(slot.endTime),
    courseDurationMinutes: Number(course.durationMinutes) || 0,
    bookings: conflictsSnap.docs.map((d: any) => d.data() as AvailabilityBooking),
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason === 'booking_conflict' ? 'booking_conflict' : 'slot_unavailable' },
      { status: 409 },
    );
  }

  // นักเรียน: ใช้คนเดียวกับตอนซื้อ หรือลูกคนอื่นของบ้านเดียวกันก็ได้
  let studentId: string | null = purchase.studentId || null;
  let studentName = purchase.studentName || '';
  if (body.studentId && body.studentId !== purchase.studentId) {
    const stSnap = await db.collection(COLLECTIONS.STUDENTS).doc(String(body.studentId)).get();
    const st = stSnap.exists ? stSnap.data() as any : null;
    if (!st || st.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    studentId = stSnap.id;
    studentName = st.name;
  }

  // สร้าง booking (confirmed ทันที — จ่ายแล้วตอนซื้อแพ็กเกจ)
  const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc();
  await bookingRef.set({
    courseId: purchase.courseId,
    courseTitle: purchase.courseTitle,
    teacherId: purchase.teacherId,
    teacherName: course.teacherName || purchase.teacherId,
    parentId: session.uid,
    parentName: session.displayName,
    studentId,
    studentName,
    studentLevel: null,
    bookingDate: validation.slot.date,
    startTime: validation.slot.startTime,
    endTime: validation.slot.endTime,
    totalPrice: 0,
    notes: `จองด้วยเครดิตแพ็กเกจ ${purchase.packageTitle}`,
    status: 'confirmed',
    packagePurchaseId: purchase.id,
    paidWithCredit: true,
    creditReleased: false,
    rescheduleCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const consumed = await consumePackageCredit(db, purchase.id, bookingRef.id);
  if (!consumed.ok) {
    // rollback booking กันค้าง
    await bookingRef.update({ status: 'cancelled', notes: 'credit_consume_failed', updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ error: consumed.reason || 'consume_failed' }, { status: 409 });
  }

  await db.collection(COLLECTIONS.NOTIFICATIONS).add({
    userId: purchase.teacherId,
    type: 'booking',
    title: 'มีการจองด้วยแพ็กเกจ',
    body: `${studentName} จอง ${purchase.courseTitle} วันที่ ${validation.slot.date} ${validation.slot.startTime}-${validation.slot.endTime} น. (เครดิตแพ็กเกจ เหลือ ${consumed.remaining} ครั้ง)`,
    data: { bookingId: bookingRef.id, purchaseId: purchase.id },
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, bookingId: bookingRef.id, remaining: consumed.remaining });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
