// แปลงเอกสาร Firestore เป็นรูปแบบที่ UI ใช้ — ใช้ร่วมกันทั้ง API route และ SSR
// เพื่อไม่ให้ข้อความที่ส่งผ่านสตรีมกับที่ render ตอนแรกไม่ตรงกัน

import type { ChatMessage, ChatMessageType, ChatRole } from '@/types/chat';

function toMillis(value: unknown): number {
  const millis = (value as any)?.toMillis?.();
  if (typeof millis === 'number') return millis;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function toChatMessage(
  id: string,
  conversationId: string,
  data: Record<string, any>,
): ChatMessage {
  return {
    id,
    conversationId,
    senderId: data.senderId,
    senderRole: (data.senderRole === 'teacher' ? 'teacher' : 'parent') as ChatRole,
    type: (data.type === 'audio' ? 'audio' : 'text') as ChatMessageType,
    text: data.text || '',
    audio: data.audio || null,
    clientMsgId: data.clientMsgId || id,
    createdAt: toMillis(data.createdAt),
  };
}
