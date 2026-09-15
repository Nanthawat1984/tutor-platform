import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/notifications?limit=20 — list own notifications (newest first).
// POST /api/notifications { action: 'read', id } | { action: 'readAll' }
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
  try {
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', session.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    const unreadSnap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', session.uid)
      .where('isRead', '==', false)
      .count()
      .get();

    return NextResponse.json({
      ok: true,
      unreadCount: unreadSnap.data().count,
      items: snap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          title: data.title,
          body: data.body,
          data: data.data || {},
          isRead: Boolean(data.isRead),
          createdAt: data.createdAt?.toMillis?.() || null,
        };
      }),
    });
  } catch (error: any) {
    const { logEvent } = await import('@/lib/log');
    logEvent('error', 'notifications_list_failed', {});
    const code = error?.code === 9 ? 'index_building' : 'list_failed';
    return NextResponse.json({ error: code }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { action?: string; id?: string };
  if (body.action === 'readAll') {
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', session.uid)
      .where('isRead', '==', false)
      .limit(200)
      .get();
    const batch = db.batch();
    snap.docs.forEach((d: any) => batch.update(d.ref, { isRead: true }));
    await batch.commit();
    return NextResponse.json({ ok: true, marked: snap.size });
  }
  if (body.action === 'read' && typeof body.id === 'string' && body.id) {
    const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc(body.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.userId !== session.uid) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await ref.update({ isRead: true });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
