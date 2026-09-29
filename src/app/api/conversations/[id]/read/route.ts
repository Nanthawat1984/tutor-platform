import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { conversationRef, requireParty } from '@/lib/chat/conversations';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/conversations/[id]/read — เคลียร์ตัวเลขข้อความค้างของผู้เรียก
// (presence.lastReadAt เขียนจาก client เพื่อแสดงเครื่องหมาย "อ่านแล้ว")
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const conversation = await requireParty(db, id, session.uid);
  if (!conversation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const field = conversation.teacherId === session.uid ? 'unreadTeacher' : 'unreadParent';
  await conversationRef(db, id).set({ [field]: 0 }, { merge: true });

  return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
