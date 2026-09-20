// LINE outbox writer ฝั่ง Next.js (Admin SDK)
// ใช้เมื่อต้องการแจ้ง LINE จาก API route โดยไม่ผ่าน Cloud Functions trigger
// dispatcher เดิม (onLineNotificationCreated + retry cron) จะหยิบ status=pending ไปส่งต่อ

import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

export interface OutboxMessage {
  type: string;
  text: string;
}

export async function queueLineOutbox(
  db: Firestore,
  input: {
    recipientUid: string;
    eventType: string;
    entityId: string;
    messages: OutboxMessage[];
  },
): Promise<'created' | 'existing' | 'skipped'> {
  const docId = createHash('sha256')
    .update(`${input.eventType}:${input.entityId}:${input.recipientUid}`)
    .digest('hex');
  const ref = db.collection('lineNotificationOutbox').doc(docId);
  const existing = await ref.get();
  if (existing.exists) return 'existing';

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(input.recipientUid).get();
  const user = userSnap.exists ? (userSnap.data() as any) : {};
  const lineUserId = String(user.lineUserId || '');
  const notificationsEnabled = process.env.LINE_NOTIFICATIONS_ENABLED === 'true';
  const enabled = notificationsEnabled && Boolean(lineUserId) && user.lineNotificationEnabled !== false;

  await ref.set({
    recipientUid: input.recipientUid,
    lineUserId,
    eventType: input.eventType,
    entityId: input.entityId,
    messages: input.messages,
    status: enabled ? 'pending' : 'skipped',
    attempts: 0,
    lastError: enabled ? null : notificationsEnabled ? 'line_user_not_linked' : 'line_notifications_disabled',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return enabled ? 'created' : 'skipped';
}

export async function notifyUser(
  db: Firestore,
  input: {
    userId: string;
    type: 'booking' | 'payment' | 'attendance' | 'report' | 'review' | 'system';
    title: string;
    body: string;
    data?: Record<string, any>;
    lineEventType?: string;
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
      console.error('queueLineOutbox failed:', e);
    }
  }
}
