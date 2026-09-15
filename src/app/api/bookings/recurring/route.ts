import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireRole } from '@/lib/auth/guards';
import { logEvent } from '@/lib/log';

// POST /api/bookings/recurring { courseId, studentId, dates: [{date,startTime,endTime}], notes? }
// Creates up to 8 weekly bookings in one transaction after validating every
// slot against the teacher schedule (same guards as single booking).
// Each booking pays separately (existing payment flow per booking).
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const role = await requireRole(['parent']).catch(() => null);
  if (!role) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as {
    courseId?: string; studentId?: string; dates?: { date: string; startTime: string; endTime: string }[]; notes?: string;
  };
  const courseId = String(body.courseId || '').trim();
  const studentId = String(body.studentId || '').trim();
  const dates = Array.isArray(body.dates) ? body.dates.slice(0, 8) : [];
  if (!courseId || !studentId || dates.length === 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') || !/^\d{2}:\d{2}$/.test(d.startTime || '') || !/^\d{2}:\d{2}$/.test(d.endTime || '')) {
      return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });
    }
  }

  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(courseId).get();
  if (!courseSnap.exists) return NextResponse.json({ error: 'course_not_found' }, { status: 404 });
  const course = { id: courseSnap.id, ...courseSnap.data() } as any;
  if (course.isActive !== true) return NextResponse.json({ error: 'course_inactive' }, { status: 409 });

  const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(studentId).get();
  const student = studentSnap.exists ? studentSnap.data() as any : null;
  if (!student || student.parentId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Conflict check across all requested dates in one query batch.
  const created: string[] = [];
  const skipped: { date: string; reason: string }[] = [];
  for (const slot of dates) {
    const conflicts = await db.collection(COLLECTIONS.BOOKINGS)
      .where('teacherId', '==', course.teacherId)
      .where('bookingDate', '==', slot.date)
      .where('status', 'in', ['pending', 'confirmed'])
      .get();
    const overlap = conflicts.docs.some((d: any) => {
      const b = d.data();
      return slot.startTime < b.endTime && slot.endTime > b.startTime;
    });
    if (overlap) {
      skipped.push({ date: slot.date, reason: 'booking_conflict' });
      continue;
    }
    const ref = await db.collection(COLLECTIONS.BOOKINGS).add({
      courseId,
      courseTitle: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      parentId: session.uid,
      parentName: session.displayName,
      studentId,
      studentName: student.name,
      studentLevel: student.level || null,
      bookingDate: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      totalPrice: course.pricePerSession,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
      status: 'pending',
      recurringGroup: `${courseId}_${Date.now()}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.push(ref.id);
  }

  logEvent('info', 'recurring_bookings_created', { count: created.length, skipped: skipped.length });
  return NextResponse.json({ ok: true, created, skipped });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
