/**
 * คิวงานค้างที่แอดมินต้องดู — แหล่งข้อมูลเดียวกับ GET /api/admin/ops-snapshot
 *
 * ทั้งหน้าแดชบอร์ดแอดมินและ API ต้องได้ตัวเลขชุดเดียวกัน จึงย้ายการนับมาอยู่ที่นี่
 * แล้วให้ทั้งสองฝั่งเรียก `countOpsQueues` ตัวเดียวกัน ตัวเลขจะได้ไม่เพี้ยนเพราะแก้คนละที่
 *
 * เกณฑ์ `actionAt` ของ 3 คิวแรกตั้งให้ตรงกับ functions/src/ops-alerts.ts เพื่อให้ตัวเลขบน
 * แดชบอร์ดกับที่แจ้งเตือนอัตโนมัติสอดคล้องกัน — ถ้าจะปรับตัวเลขให้แก้ทั้งสองที่
 */

import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

export type QueueSeverity = 'idle' | 'watch' | 'action';

export interface OpsQueueCounts {
  paymentsAwaitingReview: number;
  paymentsPaid: number;
  payoutsRequested: number;
  payoutsProcessing: number;
  stripeEventsProcessing: number;
  lineOutboxFailed: number;
}

export interface OpsQueueDefinition {
  key: keyof OpsQueueCounts;
  label: string;
  description: string;
  /** เริ่มต้องเฝ้าระวังตั้งแต่กี่รายการ */
  watchAt: number;
  /** ต้องลงมือทำทันทีตั้งแต่กี่รายการ */
  actionAt: number;
  /** หน้าที่ใช้จัดการคิวนี้ — ไม่มี = ระบบแจ้งเตือนอัตโนมัติแทน */
  actionHref?: string;
}

export interface OpsQueueCard extends OpsQueueDefinition {
  count: number;
  severity: QueueSeverity;
}

export interface OpsQueueSummary {
  action: number;
  watch: number;
  idle: number;
  /** จำนวนคิวที่ต้องลงมือทำ — ใช้แสดงบน banner สรุป */
  actionCount: number;
}

export const OPS_QUEUE_DEFINITIONS: readonly OpsQueueDefinition[] = [
  {
    key: 'paymentsAwaitingReview',
    label: 'สลิปรอตรวจ',
    description: 'ผู้ปกครองส่งสลิปมาแล้ว รอแอดมินตรวจและอนุมัติ',
    watchAt: 10,
    actionAt: 20,
    actionHref: '/admin/payments',
  },
  {
    key: 'lineOutboxFailed',
    label: 'LINE แจ้งเตือนล้มเหลว',
    description: 'ส่งข้อความ LINE ไม่สำเร็จ ระบบแจ้งเตือนอัตโนมัติเมื่อค้างตั้งแต่ 10 รายการ',
    watchAt: 5,
    actionAt: 10,
  },
  {
    key: 'stripeEventsProcessing',
    label: 'Webhook Stripe ค้าง',
    description: 'ยังประมวลผลไม่จบ อาจทำให้สถานะการจ่ายเงินไม่ตรงกับ Stripe',
    watchAt: 2,
    actionAt: 5,
  },
  {
    key: 'payoutsRequested',
    label: 'ครูขอเบิกเงินค้าง',
    description: 'รอแอดมินอนุมัติจ่ายเงินให้ครู',
    watchAt: 5,
    actionAt: 15,
    actionHref: '/admin/payouts',
  },
  {
    key: 'payoutsProcessing',
    label: 'โอนเงินให้ครูกำลังดำเนินการ',
    description: 'กดจ่ายแล้วแต่ยังไม่สำเร็จ ต้องตรวจสอบสถานะการโอน',
    watchAt: 3,
    actionAt: 10,
    actionHref: '/admin/payouts',
  },
  {
    key: 'paymentsPaid',
    label: 'เงินจ่ายแล้วยังไม่ปล่อย',
    description: 'ได้รับเงินแล้วแต่ escrow ยังไม่ปล่อยให้ครู',
    watchAt: 20,
    actionAt: 50,
    actionHref: '/admin/payments',
  },
] as const;

export const EMPTY_OPS_QUEUE_COUNTS: OpsQueueCounts = {
  paymentsAwaitingReview: 0,
  paymentsPaid: 0,
  payoutsRequested: 0,
  payoutsProcessing: 0,
  stripeEventsProcessing: 0,
  lineOutboxFailed: 0,
};

/**
 * ระดับความเร่งด่วนของคิว — นับเป็น idle ถ้าว่างเปล่า ต่อให้ตั้ง watchAt ไว้เท่าไรก็ตาม
 */
export function classifyQueue(
  count: number,
  definition: Pick<OpsQueueDefinition, 'watchAt' | 'actionAt'>,
): QueueSeverity {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (safeCount <= 0) return 'idle';
  if (safeCount >= definition.actionAt) return 'action';
  if (safeCount >= definition.watchAt) return 'watch';
  return 'idle';
}

/**
 * คิวที่ต้องลงมือทำมาก่อน ตามจำนวนรายการ แล้วจึงคิวที่แค่เฝ้าระวัง
 * (คิวที่ว่างไปอยู่ท้ายสุดเพื่อไม่ให้บังการ์ดที่มีปัญหาจริง)
 */
export function buildOpsQueueCards(counts: Partial<OpsQueueCounts> | null | undefined): OpsQueueCard[] {
  const safeCounts = { ...EMPTY_OPS_QUEUE_COUNTS, ...(counts || {}) };

  const severityRank: Record<QueueSeverity, number> = { action: 0, watch: 1, idle: 2 };

  return OPS_QUEUE_DEFINITIONS
    .map((definition) => {
      const rawCount = safeCounts[definition.key];
      const count = typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
        ? Math.floor(rawCount)
        : 0;
      return { ...definition, count, severity: classifyQueue(count, definition) };
    })
    .sort((a, b) => (
      severityRank[a.severity] - severityRank[b.severity] || b.count - a.count
    ));
}

/** สรุปจำนวนคิวแยกตามระดับ เพื่อแสดง banner แบบสั้นบนแดชบอร์ด */
export function summarizeOpsQueues(cards: readonly OpsQueueCard[]): OpsQueueSummary {
  const summary: OpsQueueSummary = { action: 0, watch: 0, idle: 0, actionCount: 0 };
  for (const card of cards) {
    summary[card.severity] += 1;
    if (card.severity === 'action') summary.actionCount += card.count;
  }
  return summary;
}

/**
 * นับคิวทั้งหมดจาก Firestore ด้วย count aggregation (อ่านแค่ตัวเลข
 * ไม่ดึงเอกสาร ไม่มี PFI) ใช้ร่วมกันทั้งหน้าแดชบอร์ดและ API
 */
export async function countOpsQueues(db: Firestore): Promise<OpsQueueCounts> {
  const [
    awaitingReview,
    paidUnreleased,
    payoutRequested,
    payoutProcessing,
    stuckWebhooks,
    failedOutbox,
  ] = await Promise.all([
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'awaiting_review').count().get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').count().get(),
    db.collection(COLLECTIONS.PAYOUTS).where('status', '==', 'requested').count().get(),
    db.collection(COLLECTIONS.PAYOUTS).where('status', '==', 'processing').count().get(),
    db.collection(COLLECTIONS.STRIPE_EVENTS).where('status', '==', 'processing').count().get(),
    db.collection('lineNotificationOutbox').where('status', '==', 'failed').count().get(),
  ]);

  return {
    paymentsAwaitingReview: awaitingReview.data().count,
    paymentsPaid: paidUnreleased.data().count,
    payoutsRequested: payoutRequested.data().count,
    payoutsProcessing: payoutProcessing.data().count,
    stripeEventsProcessing: stuckWebhooks.data().count,
    lineOutboxFailed: failedOutbox.data().count,
  };
}