// LINE outbox writer ฝั่ง Next.js (Admin SDK)
// ใช้เมื่อต้องการแจ้ง LINE จาก API route โดยไม่ผ่าน Cloud Functions trigger
// dispatcher เดิม (onLineNotificationCreated + retry cron) จะหยิบ status=pending ไปส่งต่อ
//
// ค่า flag ต้องอ่านแบบเดียวกับ functions/src/line/config.ts (readBoolean) ไม่งั้น
// ตั้ง LINE_NOTIFICATIONS_ENABLED=1 จะทำให้สองฝั่งเชื่อมต่างกัน

import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import type { LineNotificationEvent } from '@/types/line';

export type OutboxMessage = Record<string, unknown>;

// ต้องตรงกับ readBoolean ใน functions/src/line/config.ts
function readFlagEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.LINE_NOTIFICATIONS_ENABLED || 'false').trim().toLowerCase());
}

export async function queueLineOutbox(
  db: Firestore,
  input: {
    recipientUid: string;
    eventType: LineNotificationEvent;
    entityId: string;
    messages: OutboxMessage[];
  },
): Promise<'created' | 'existing' | 'skipped'> {
  const docId = createHash('sha256')
    .update(`${input.eventType}:${input.entityId}:${input.recipientUid}`)
    .digest('hex');
  const ref = db.collection('lineNotificationOutbox').doc(docId);
  const userRef = db.collection(COLLECTIONS.USERS).doc(input.recipientUid);
  const notificationsEnabled = readFlagEnabled();

  // ต้องเป็น transaction: ถ้าใช้ get() แล้ว set() ตามมา จะมีช่องว่างให้สอง request
  // จอง/จ่ายเงินพร้อมกันผ่าน doc เดียวกันแล้วส่งซ้ำได้
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return 'existing' as const;

    const userSnap = await transaction.get(userRef);
    const user = userSnap.exists ? (userSnap.data() as any) : {};
    const lineUserId = String(user.lineUserId || '');
    const enabled = notificationsEnabled && Boolean(lineUserId) && user.lineNotificationEnabled !== false;

    const record: Record<string, unknown> = {
      recipientUid: input.recipientUid,
      lineUserId,
      eventType: input.eventType,
      entityId: input.entityId,
      messages: input.messages,
      status: enabled ? 'pending' : 'skipped',
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!enabled) {
      record.lastError = notificationsEnabled ? 'line_user_not_linked' : 'line_notifications_disabled';
    }
    transaction.create(ref, record);
    return enabled ? 'created' as const : 'skipped' as const;
  });
}

export async function notifyUser(
  db: Firestore,
  input: {
    userId: string;
    type: 'booking' | 'payment' | 'attendance' | 'report' | 'review' | 'system';
    title: string;
    body: string;
    data?: Record<string, any>;
    lineEventType?: LineNotificationEvent;
    lineEntityId?: string;
    lineMessages?: OutboxMessage[];
  },
): Promise<void> {
  await db.collection(COLLECTIONS.NOTIFICATIONS).add({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data || {},
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (input.lineEventType && input.lineEntityId && input.lineMessages?.length) {
    try {
      await queueLineOutbox(db, {
        recipientUid: input.userId,
        eventType: input.lineEventType,
        entityId: input.lineEntityId,
        messages: input.lineMessages,
      });
    } catch (e) {
      // in-app notification เขียนสำเร็จแล้ว — LINE ล้มเหลวห้ามทำให้ธุรกรรมหลักล้ม
      console.error('queueLineOutbox failed:', e instanceof Error ? e.message : 'unknown_error');
    }
  }
}