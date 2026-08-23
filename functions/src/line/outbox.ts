import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getLineServerConfig } from './config';
import { LineApiError, pushLineMessages, type LineMessage } from './client';
import type { LineNotificationEvent, LineNotificationOutbox } from './types';

const OUTBOX_COLLECTION = 'lineNotificationOutbox';
const MAX_ATTEMPTS = 5;

export interface CreateLineOutboxInput {
  recipientUid: string;
  eventType: LineNotificationEvent;
  entityId: string;
  messages: LineMessage[];
}

export function makeLineOutboxId(eventType: LineNotificationEvent, entityId: string, recipientUid: string): string {
  return createHash('sha256')
    .update(`${eventType}:${entityId}:${recipientUid}`)
    .digest('hex');
}

export async function createLineOutbox(
  db: Firestore,
  input: CreateLineOutboxInput,
): Promise<'created' | 'existing' | 'skipped'> {
  const ref = db.collection(OUTBOX_COLLECTION).doc(
    makeLineOutboxId(input.eventType, input.entityId, input.recipientUid),
  );
  const config = getLineServerConfig();

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return 'existing';

    const userSnap = await transaction.get(db.collection('users').doc(input.recipientUid));
    const user = userSnap.exists ? userSnap.data() as { lineUserId?: string; lineNotificationEnabled?: boolean } : {};
    const lineUserId = user.lineUserId || '';
    const enabled = config.enabled && Boolean(lineUserId) && user.lineNotificationEnabled !== false;
    const status: LineNotificationOutbox['status'] = enabled ? 'pending' : 'skipped';
    const now = FieldValue.serverTimestamp();

    const record: Record<string, unknown> = {
      recipientUid: input.recipientUid,
      lineUserId,
      eventType: input.eventType,
      entityId: input.entityId,
      messages: input.messages,
      status,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (!enabled) record.lastError = config.enabled ? 'line_user_not_linked' : 'line_notifications_disabled';
    transaction.create(ref, record);
    return status === 'pending' ? 'created' : 'skipped';
  });
}

export async function dispatchLineOutbox(
  db: Firestore,
  docId: string,
): Promise<'sent' | 'retry' | 'skipped'> {
  const ref = db.collection(OUTBOX_COLLECTION).doc(docId);
  const claimed = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as LineNotificationOutbox;
    if (data.status === 'sent' || data.status === 'skipped' || data.status === 'sending') return null;
    if (data.attempts >= MAX_ATTEMPTS) {
      transaction.update(ref, { status: 'skipped', lastError: 'retry_limit_reached', updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    transaction.update(ref, {
      status: 'sending',
      attempts: (data.attempts || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { lineUserId: data.lineUserId, messages: data.messages, attempts: (data.attempts || 0) + 1 };
  });

  if (!claimed) {
    const current = await ref.get();
    const status = current.data()?.status;
    return status === 'skipped' ? 'skipped' : status === 'sent' ? 'sent' : 'retry';
  }

  try {
    await pushLineMessages(claimed.lineUserId, claimed.messages);
    await ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return 'sent';
  } catch (error) {
    const permanent = error instanceof LineApiError && !error.retryable;
    if (permanent) {
      await ref.update({ status: 'skipped', lastError: error.responseCode || 'line_user_unavailable', updatedAt: FieldValue.serverTimestamp() });
      return 'skipped';
    }

    const delayMs = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.max(0, claimed.attempts - 1)));
    await ref.update({
      status: 'failed',
      lastError: error instanceof Error ? error.message.slice(0, 160) : 'line_delivery_failed',
      nextAttemptAt: Timestamp.fromMillis(Date.now() + delayMs),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'retry';
  }
}

export { MAX_ATTEMPTS, OUTBOX_COLLECTION };
