import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { buildOpsQueueCards, countOpsQueues, summarizeOpsQueues } from '@/lib/admin/ops-queues';

// GET /api/admin/ops-snapshot — one JSON snapshot of queues an admin must watch.
// Admin-only. Counts only (no PII, no document bodies) so it stays cheap and
// safe to poll from a status dashboard or uptime monitor with an admin token.
// ตัวเลขมาจาก countOpsQueues ตัวเดียวกับหน้าแดชบอร์ดแอดมิน จึงไม่เพี้ยนคนละที่
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const adminSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const queues = await countOpsQueues(db);
  const cards = buildOpsQueueCards(queues);

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    queues,
    // ระดับความเร่งด่วนและหน้าที่ต้องไปแก้ เพื่อให้ผู้ตรวจสอบภายนอก
    // (uptime monitor) ตัดสินใจได้โดยไม่ต้องรู้เกณฑ์ของระบบ
    summary: summarizeOpsQueues(cards),
    items: cards.map(({ key, label, count, severity, actionHref }) => ({
      key, label, count, severity, actionHref: actionHref || null,
    })),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
