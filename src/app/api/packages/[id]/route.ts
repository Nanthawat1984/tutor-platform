import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

// PATCH /api/packages/[id] { isActive?, title?, priceTotal? } — ครูเจ้าของแก้/ปิดการขาย
// DELETE /api/packages/[id] — ปิดการขาย (soft close, ไม่ลบประวัติ)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const ref = db.collection(COLLECTIONS.PACKAGES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pkg = snap.data() as any;
  if (pkg.teacherId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { isActive?: boolean; title?: string; priceTotal?: number };
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim().slice(0, 120);
  if (typeof body.priceTotal === 'number' && body.priceTotal > 0) {
    const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(pkg.courseId).get();
    const single = Number(courseSnap.data()?.pricePerSession) || 0;
    const listTotal = single * Number(pkg.sessionsTotal);
    if (body.priceTotal < listTotal) {
      updates.priceTotal = Math.round(body.priceTotal);
      updates.discountPercent = listTotal > 0 ? Math.max(0, Math.round(((listTotal - (updates.priceTotal as number)) / listTotal) * 100)) : 0;
    }
  }
  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const ref = db.collection(COLLECTIONS.PACKAGES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if ((snap.data() as any).teacherId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await ref.update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
