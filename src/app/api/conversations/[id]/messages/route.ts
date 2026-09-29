import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import {
  CHAT_AUDIO_EXTENSIONS,
  CHAT_AUDIO_MAX_BYTES,
  CHAT_AUDIO_MAX_SECONDS,
  CHAT_AUDIO_RATE,
  CHAT_HISTORY_PAGE,
  CHAT_LIVE_WINDOW,
  CHAT_MAX_LENGTH,
  CHAT_PEAKS_COUNT,
  CHAT_TEXT_RATE,
  audioPathFor,
  type ChatAudioExtension,
  type ChatMessageType,
  type ChatRole,
} from '@/types/chat';
import {
  conversationRef,
  messagesRef,
  otherParty,
  requireParty,
} from '@/lib/chat/conversations';
import { toChatMessage } from '@/lib/chat/serialize';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';

const CLIENT_MSG_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const STORAGE_HOSTS = ['https://firebasestorage.googleapis.com/', 'https://storage.googleapis.com/'];

interface RouteContext {
  params: Promise<{ id: string }>;
}

function validAudioUrl(url: string, path: string): boolean {
  if (!url || !STORAGE_HOSTS.some((host) => url.startsWith(host))) return false;
  // ยืนยันว่า URL ชี้ไปยังไฟล์ที่ประกาศไว้จริง (ไม่ใช่พาไปหาไฟล์อื่นใน bucket)
  return url.includes(encodeURIComponent(path));
}

// GET  /api/conversations/[id]/messages?before=<ms>&limit=<n> — ประวัติเก่ากว่า before
// POST /api/conversations/[id]/messages — ส่งข้อความ (ข้อความ/เสียง)
export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const conversation = await requireParty(db, id, session.uid);
  if (!conversation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const search = new URL(request.url).searchParams;
  const limit = Math.min(
    Math.max(Number(search.get('limit')) || CHAT_HISTORY_PAGE, 1),
    CHAT_LIVE_WINDOW,
  );
  const before = Number(search.get('before'));

  let query = messagesRef(db, id).orderBy('createdAt', 'desc').limit(limit);
  if (Number.isFinite(before) && before > 0) {
    query = query.startAfter(Timestamp.fromMillis(before));
  }

  try {
    const snap = await query.get();
    const items = snap.docs
      .map((d: any) => toChatMessage(d.id, id, d.data()))
      .reverse(); // เก่า → ใหม่
    return NextResponse.json({
      ok: true,
      items,
      hasMore: snap.docs.length === limit,
    });
  } catch (error: any) {
    logEvent('error', 'conversations_messages_failed', { conversationId: id, code: error?.code });
    return NextResponse.json({ error: 'list_failed' }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    clientMsgId?: string;
    type?: ChatMessageType;
    text?: string;
    audio?: { ext?: string; url?: string; durationMs?: number; size?: number; peaks?: number[] } | null;
  };

  const clientMsgId = String(body.clientMsgId || '').trim();
  if (!CLIENT_MSG_ID_RE.test(clientMsgId)) {
    return NextResponse.json({ error: 'invalid_client_msg_id' }, { status: 400 });
  }

  const conversation = await requireParty(db, id, session.uid);
  if (!conversation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const type: ChatMessageType = body.type === 'audio' ? 'audio' : 'text';
  const text = String(body.text || '').trim().slice(0, CHAT_MAX_LENGTH);
  let audio: Record<string, any> | null = null;

  if (type === 'audio') {
    const input = body.audio;
    const ext = String(input?.ext || '') as ChatAudioExtension;
    if (!input?.url || !CHAT_AUDIO_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const expectedPath = audioPathFor(id, session.uid, clientMsgId, ext);
    const size = Number(input.size) || 0;
    const durationMs = Number(input.durationMs) || 0;
    const peaks = Array.isArray(input.peaks) ? input.peaks.slice(0, CHAT_PEAKS_COUNT) : [];

    // ไฟล์เสียงต้องอยู่ในโฟลเดอร์ของผู้ส่งในห้องนี้ และ URL ต้องชี้ไปที่ไฟล์นั้นจริง
    if (!validAudioUrl(String(input.url), expectedPath)) {
      return NextResponse.json({ error: 'invalid_audio' }, { status: 400 });
    }
    if (size <= 0 || size > CHAT_AUDIO_MAX_BYTES) {
      return NextResponse.json({ error: 'audio_too_large' }, { status: 413 });
    }
    if (durationMs <= 0 || durationMs > CHAT_AUDIO_MAX_SECONDS * 1000) {
      return NextResponse.json({ error: 'invalid_duration' }, { status: 400 });
    }

    sweepRateLimitBuckets();
    const audioLimit = checkRateLimit(`chat:audio:${session.uid}`, CHAT_AUDIO_RATE.limit, CHAT_AUDIO_RATE.windowMs);
    if (!audioLimit.ok) {
      return NextResponse.json({ error: 'rate_limited' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(audioLimit.resetAfterMs / 1000)) },
      });
    }

    audio = {
      path: expectedPath,
      url: String(input.url),
      ext,
      durationMs: Math.round(durationMs),
      size,
      peaks: peaks.map((p) => Math.max(0, Math.min(1, Number(p) || 0))),
    };
  } else {
    if (!text) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

    sweepRateLimitBuckets();
    const textLimit = checkRateLimit(`chat:text:${session.uid}`, CHAT_TEXT_RATE.limit, CHAT_TEXT_RATE.windowMs);
    if (!textLimit.ok) {
      return NextResponse.json({ error: 'rate_limited' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(textLimit.resetAfterMs / 1000)) },
      });
    }
  }

  const senderRole: ChatRole = conversation.teacherId === session.uid ? 'teacher' : 'parent';
  const other = otherParty(conversation, session.uid);
  const messageRef = messagesRef(db, id).doc(clientMsgId);
  const unreadField = senderRole === 'teacher' ? 'unreadParent' : 'unreadTeacher';
  const preview = type === 'audio' ? '🎤 ข้อความเสียง' : text;
  const convRef = conversationRef(db, id);

  let created = false;
  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(messageRef);
      // ส่งซ้ำ (retry จาก offline queue) — ไม่ต้องนับ unread ซ้ำ
      if (existing.exists) return;
      created = true;

      tx.create(messageRef, {
        conversationId: id,
        // denormalize ไว้ให้กฎอ่านข้อความเช็กสิทธิ์ได้โดยไม่ต้องอ่านห้องคุยทีละเอกสาร
        participantIds: [conversation.parentId, conversation.teacherId],
        senderId: session.uid,
        senderRole,
        type,
        text,
        audio,
        clientMsgId,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.update(convRef, {
        lastMessageType: type,
        lastMessageText: preview.slice(0, 120),
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderId: session.uid,
        [unreadField]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    logEvent('error', 'chat_send_failed', { conversationId: id, type });
    return NextResponse.json({ error: 'send_failed' }, { status: 500 });
  }

  // แจ้งเตือนในแอป (best effort) — ไม่ยิง LINE ตรง ๆ ให้รอ outbox ตามเดิม
  if (created) {
    try {
      await db.collection(COLLECTIONS.NOTIFICATIONS).add({
        userId: other.otherId,
        type: 'booking',
        title: `ข้อความใหม่จาก ${senderRole === 'teacher' ? 'คุณครู' : 'ผู้ปกครอง'}`,
        body: `${other.otherName}: ${preview.slice(0, 80)}`,
        data: { conversationId: id },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logEvent('warn', 'chat_notify_failed', { conversationId: id });
    }
  }

  return NextResponse.json({ ok: true, id: clientMsgId, created });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
