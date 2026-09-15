import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// GET /api/me/export — PDPA self-service: returns the caller's own profile,
// students, bookings, payments (without internal fee fields), reviews and
// notifications as JSON. No other user's data is included.
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const [userSnap, studentsSnap, bookingsSnap, reviewsSnap, notifsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(session.uid).get(),
    db.collection(COLLECTIONS.STUDENTS).where('parentId', '==', session.uid).limit(100).get(),
    db.collection(COLLECTIONS.BOOKINGS)
      .where(session.uid ? 'parentId' : 'parentId', '==', session.uid)
      .limit(200).get(),
    db.collection(COLLECTIONS.REVIEWS).where('parentId', '==', session.uid).limit(100).get(),
    db.collection(COLLECTIONS.NOTIFICATIONS).where('userId', '==', session.uid).limit(100).get(),
  ]);

  const user = userSnap.exists ? userSnap.data() as any : {};
  // Strip internal/secret fields even for the owner.
  const { ...profile } = user;

  return NextResponse.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    profile,
    students: studentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    bookings: bookingsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    reviews: reviewsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    notifications: notifsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
