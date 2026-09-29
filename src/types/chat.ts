// Realtime chat — a conversation is a stable parent ↔ teacher pair, so a thread
// stays available before booking, during the lesson and long after it ends.
//
// conversations/{conversationId}            — thread metadata (server-written)
// conversations/{id}/messages/{messageId}   — messages (server-written, read by client)
// conversations/{id}/presence/{uid}         — typing / lastSeen / lastRead (client-written)
//
// Legacy booking-scoped `messages` ถูกย้ายเข้าที่นี่แล้วด้วย
// scripts/migrate-chat-to-conversations.cjs (ข้อมูลเดิมไม่ถูกลบ)

export const CONVERSATIONS_COLLECTION = 'conversations';
export const MESSAGES_SUBCOLLECTION = 'messages';
export const PRESENCE_SUBCOLLECTION = 'presence';

export const CHAT_MAX_LENGTH = 1000;
export const CHAT_AUDIO_MAX_BYTES = 5 * 1024 * 1024; // ~5 นาทีที่ 48kbps
export const CHAT_AUDIO_MAX_SECONDS = 300;
export const CHAT_PEAKS_COUNT = 48; // waveform bars stored per audio message
export const CHAT_HISTORY_PAGE = 50;
export const CHAT_LIVE_WINDOW = 200; // newest messages kept in the live listener

// แชทเปิดได้ตลอดเวลา (ไม่จำกัดเฉพาะชั่วโมงการจอง) — จึงยกโควตาจาก 20/ชม.
export const CHAT_TEXT_RATE = { limit: 60, windowMs: 60 * 60_000 };
export const CHAT_AUDIO_RATE = { limit: 20, windowMs: 60 * 60_000 };

// ถือว่า "ออนไลน์" เมื่อเห็น heartbeat ภายในช่วงนี้
export const CHAT_ONLINE_WINDOW_MS = 70_000;
export const CHAT_HEARTBEAT_MS = 30_000;

export type ChatRole = 'teacher' | 'parent';
export type ChatMessageType = 'text' | 'audio';

export interface ChatAudio {
  url: string;
  path: string;
  ext: ChatAudioExtension;
  durationMs: number;
  size: number;
  peaks: number[]; // normalized 0..1 bars for the waveform
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: ChatRole;
  type: ChatMessageType;
  text: string;
  audio: ChatAudio | null;
  clientMsgId: string;
  createdAt: number; // epoch ms
}

export interface ConversationSummary {
  id: string;
  parentId: string;
  teacherId: string;
  otherId: string;
  otherName: string;
  otherPhotoURL: string | null;
  otherRole: ChatRole;
  contextLabel: string | null;
  bookingId: string | null;
  lastMessageText: string;
  lastMessageType: ChatMessageType;
  lastMessageAt: number | null;
  lastSenderId: string | null;
  unread: number;
}

export interface ChatPresence {
  uid: string;
  typing: boolean;
  lastSeenAt: number;
  lastReadAt: number | null;
}

/**
 * Deterministic conversation id so "open chat with this teacher" is idempotent
 * from both client and server without a lookup round trip. Pure JS so the
 * browser and the API route always agree on the same id.
 */
export function conversationIdFor(parentId: string, teacherId: string): string {
  const key = [parentId, teacherId].sort().join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `c${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function isParty(
  conversation: { parentId?: string; teacherId?: string } | null | undefined,
  uid: string,
): boolean {
  if (!conversation) return false;
  return conversation.parentId === uid || conversation.teacherId === uid;
}

export const CHAT_AUDIO_EXTENSIONS = ['webm', 'm4a', 'ogg'] as const;
export type ChatAudioExtension = (typeof CHAT_AUDIO_EXTENSIONS)[number];

/** Safari บันทึกเป็น mp4/m4a, Chrome/Firefox เป็น webm — path ต้องตรงกับนามสกุลจริง */
export function audioPathFor(
  conversationId: string,
  uid: string,
  messageId: string,
  extension: ChatAudioExtension = 'webm',
): string {
  return `chat-audio/${conversationId}/${uid}/${messageId}.${extension}`;
}

/** ข้อความเสียงยังไม่ถูกถอดเสียง — แสดงเป็นไอคอนเสียง + เวลา */
export function previewText(type: ChatMessageType, text: string): string {
  if (type === 'audio') return '🎤 ข้อความเสียง';
  return text;
}
