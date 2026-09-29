// Server-side helpers for realtime chat conversations (Admin SDK).
// ทุกอย่างที่ "เขียน" ลง Firestore วิ่งผ่านไฟล์นี้หรือ API route เท่านั้น —
// ฝั่ง client อ่านอย่างเดียว (นอกจาก presence ของตัวเอง)

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  conversationIdFor,
  type ChatRole,
  type ConversationSummary,
} from '@/types/chat';
import { formatDate, formatTime } from '@/lib/utils';

export interface ConversationDoc {
  id: string;
  parentId: string;
  teacherId: string;
  parentName: string;
  teacherName: string;
  parentPhotoURL: string | null;
  teacherPhotoURL: string | null;
  bookingId: string | null;
  contextLabel: string | null;
  lastMessageType: 'text' | 'audio';
  lastMessageText: string;
  lastMessageAt: unknown;
  lastSenderId: string | null;
  unreadParent: number;
  unreadTeacher: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export function conversationRef(db: Firestore, id: string) {
  return db.collection(CONVERSATIONS_COLLECTION).doc(id);
}

export function messagesRef(db: Firestore, id: string) {
  return conversationRef(db, id).collection(MESSAGES_SUBCOLLECTION);
}

export async function getConversation(
  db: Firestore,
  id: string,
): Promise<(ConversationDoc & { raw: Record<string, any> }) | null> {
  const snap = await conversationRef(db, id).get();
  if (!snap.exists) return null;
  const raw = snap.data() as Record<string, any>;
  return {
    id: snap.id,
    parentId: raw.parentId,
    teacherId: raw.teacherId,
    parentName: raw.parentName || 'ผู้ปกครอง',
    teacherName: raw.teacherName || 'คุณครู',
    parentPhotoURL: raw.parentPhotoURL || null,
    teacherPhotoURL: raw.teacherPhotoURL || null,
    bookingId: raw.bookingId || null,
    contextLabel: raw.contextLabel || null,
    lastMessageType: raw.lastMessageType || 'text',
    lastMessageText: raw.lastMessageText || '',
    lastMessageAt: raw.lastMessageAt ?? null,
    lastSenderId: raw.lastSenderId ?? null,
    unreadParent: Number(raw.unreadParent) || 0,
    unreadTeacher: Number(raw.unreadTeacher) || 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  };
}

/** คืน conversation เมื่อ uid เป็นคู่สนทนาจริงเท่านั้น — ใช้ทุกก่อน read/write */
export async function requireParty(
  db: Firestore,
  id: string,
  uid: string,
): Promise<Awaited<ReturnType<typeof getConversation>>> {
  const conversation = await getConversation(db, id);
  if (!conversation) return null;
  if (conversation.parentId !== uid && conversation.teacherId !== uid) return null;
  return conversation;
}

export function otherParty(conversation: ConversationDoc, uid: string) {
  const teacherSide = conversation.teacherId === uid;
  return {
    otherId: teacherSide ? conversation.parentId : conversation.teacherId,
    otherName: teacherSide ? conversation.parentName : conversation.teacherName,
    otherPhotoURL: teacherSide ? conversation.parentPhotoURL : conversation.teacherPhotoURL,
    otherRole: (teacherSide ? 'parent' : 'teacher') as ChatRole,
  };
}

export function bookingContextLabel(booking: Record<string, any> | null | undefined): string | null {
  if (!booking) return null;
  const course = booking.courseTitle ? String(booking.courseTitle) : null;
  if (!course) return null;
  if (!booking.bookingDate) return `การจอง: ${course}`;
  return `การจอง: ${course} · ${formatDate(booking.bookingDate, 'd MMM')} ${formatTime(booking.startTime)}`;
}

/**
 * เปิดห้องคุยกับครู — id คำนวณจากคู่ (parent, teacher) จึงเรียกซ้ำได้โดยไม่
 * สร้างห้องซ้ำ และไม่ต้องค้นหาก่อน
 */
export async function getOrCreateConversation(
  db: Firestore,
  input: { parentId: string; teacherId: string; bookingId?: string | null; contextLabel?: string | null },
): Promise<{ conversation: NonNullable<Awaited<ReturnType<typeof getConversation>>>; created: boolean }> {
  const id = conversationIdFor(input.parentId, input.teacherId);
  const existing = await getConversation(db, id);
  if (existing) {
    // ผูกการจองเพิ่มเติมเข้ากับห้องเดิมได้ (คุยครูก่อน แล้วค่อยจองทีหลัง)
    if (input.bookingId && existing.bookingId !== input.bookingId) {
      await conversationRef(db, id).update({
        bookingId: input.bookingId,
        contextLabel: input.contextLabel ?? existing.contextLabel,
        updatedAt: FieldValue.serverTimestamp(),
      });
      existing.bookingId = input.bookingId;
      existing.contextLabel = input.contextLabel ?? existing.contextLabel;
    }
    return { conversation: existing, created: false };
  }

  const [parentSnap, teacherSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(input.parentId).get(),
    db.collection(COLLECTIONS.USERS).doc(input.teacherId).get(),
  ]);
  const parent = parentSnap.exists ? (parentSnap.data() as any) : {};
  const teacher = teacherSnap.exists ? (teacherSnap.data() as any) : {};

  await conversationRef(db, id).set({
    parentId: input.parentId,
    teacherId: input.teacherId,
    participantIds: [input.parentId, input.teacherId],
    parentName: parent.displayName || 'ผู้ปกครอง',
    teacherName: teacher.displayName || 'คุณครู',
    parentPhotoURL: parent.photoURL || null,
    teacherPhotoURL: teacher.photoURL || null,
    bookingId: input.bookingId || null,
    contextLabel: input.contextLabel || null,
    lastMessageType: 'text',
    lastMessageText: '',
    // ต้องมีค่าตั้งแต่สร้าง — query รายการห้องคุย orderBy('lastMessageAt')
    // จะตัดเอกสารที่ยังไม่มีฟิลด์นี้ทิ้ง
    lastMessageAt: FieldValue.serverTimestamp(),
    lastSenderId: null,
    unreadParent: 0,
    unreadTeacher: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { conversation: (await getConversation(db, id))!, created: true };
}

export function toSummary(conversation: ConversationDoc, viewerUid: string): ConversationSummary {
  const other = otherParty(conversation, viewerUid);
  return {
    id: conversation.id,
    parentId: conversation.parentId,
    teacherId: conversation.teacherId,
    otherId: other.otherId,
    otherName: other.otherName,
    otherPhotoURL: other.otherPhotoURL,
    otherRole: other.otherRole,
    contextLabel: conversation.contextLabel,
    bookingId: conversation.bookingId,
    lastMessageText: conversation.lastMessageText,
    lastMessageType: conversation.lastMessageType,
    lastMessageAt: toMillis(conversation.lastMessageAt),
    lastSenderId: conversation.lastSenderId,
    unread: viewerUid === conversation.teacherId ? conversation.unreadTeacher : conversation.unreadParent,
  };
}

export function toMillis(value: unknown): number | null {
  const millis = (value as any)?.toMillis?.();
  if (typeof millis === 'number') return millis;
  if (value instanceof Date) return value.getTime();
  return null;
}
