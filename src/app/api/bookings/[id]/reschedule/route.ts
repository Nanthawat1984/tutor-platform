import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { rescheduleBooking } from '@/lib/booking-actions';

// POST /api/bookings/[id]/reschedule { slot: { scheduleId, date, startTime, endTime } }
// parent หรือ teacher ที่เป็นคู่สัญญาเรียกได้เอง — ไม่ต้องผ่านแอดมิน
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    slot?: { scheduleId?: string; date?: string; startTime?: string; endTime?: string };
  };
  const slot = body.slot || {};
  if (!slot.scheduleId || !slot.date || !slot.startTime || !slot.endTime) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const userSnap = await db.collection('users').doc(session.uid).get();
  const role = userSnap.data()?.role === 'teacher' ? 'teacher' : 'parent';

  const result = await rescheduleBooking(db, {
    bookingId: id,
    uid: session.uid,
    actorRole: role as 'parent' | 'teacher',
    slot: {
      scheduleId: String(slot.scheduleId),
      date: String(slot.date),
      startTime: String(slot.startTime),
      endTime: String(slot.endTime),
    },
  });
  if (!result.ok) {
    const status = result.error === 'forbidden' || result.error === 'not_found' ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
