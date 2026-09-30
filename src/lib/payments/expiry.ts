// Payment expiry + history retention
//
// นโยบาย (ตามคำขอ):
//  1) รายการที่ยัง "รอชำระ" เกิน 1 วัน (นับจาก createdAt) → ยกเลิกอัตโนมัติ
//     (payment cancelled + booking pending ค้างถูกยกเลิกด้วย + แจ้งเตือนผู้ปกครอง)
//  2) ประวัติที่ถูกยกเลิก (cancelled) จะ "หายไปจากหน้าประวัติ" ใน 3 วันหลังยกเลิก
//     — ซ่อนจาก UI และลบออกจาก DB เมื่อเกินกำหนด (ไม่กระทบรายการชำระแล้ว/คืนเงิน)
//
// หมายเหตุ: expiresAt (15/30 นาที) เป็นอายุ QR/checkout session เท่านั้น
// — กำหนดอายุ "รายการรอชำระ" ใช้ createdAt + 1 วัน ตามนโยบาย
//
// รันผ่าน: (a) sweep เมื่อเปิดหน้าประวัติการชำระเงิน (lazy) และ
//          (b) Cloud Function scheduledPaymentSweep ทุกชั่วโมง (mirror เดียวกัน)
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

/** รายการ pending รอได้ไม่เกิน 1 วัน */
export const PENDING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;
/** รายการยกเลิกถูกซ่อน/ลบหลังจาก 3 วัน */
export const CANCELLED_HISTORY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** เวลาที่รายการ pending หมดอายุ = createdAt + 1 วัน */
export function paymentDeadlineMs(payment: any): number {
  return (payment.createdAt?.toMillis?.() || 0) + PENDING_PAYMENT_TTL_MS;
}

/** เวลาที่รายการยกเลิกถูกลบออกจากประวัติ */
function cancelledCleanupMs(payment: any): number {
  const cancelled = payment.cancelledAt?.toMillis?.() ?? payment.updatedAt?.toMillis?.() ?? 0;
  return cancelled + CANCELLED_HISTORY_TTL_MS;
}

/** รายการนี้ควรแสดงในหน้าประวัติหรือไม่ (cancelled เกิน 3 วัน → ซ่อน) */
export function isHistoryVisible(payment: any, nowMs: number = Date.now()): boolean {
  if (payment.status === 'cancelled') return nowMs < cancelledCleanupMs(payment);
  return true;
}

/** เวลาหมดอายุ (ms) สำหรับแสดงนับถอยหลังใน UI */
export function pendingExpiryMs(payment: any): number {
  return paymentDeadlineMs(payment);
}

export interface PaymentSweepResult {
  expiredPayments: number;   // pending → cancelled
  cancelledBookings: number; // booking ที่ถูกยกเลิกตาม
  deletedHistory: number;    // cancelled เกิน 3 วันถูกลบ
}

/**
 * กวาดรายการค้างทั้งระบบ — idempotent (guard สถานะ + อ่าน snapshot สดก่อนเขียน)
 * ห้ามเรียกจาก client ตรง ๆ — server components/admin เท่านั้น
 */
export async function sweepExpiredPayments(db: any, now: Date = new Date()): Promise<PaymentSweepResult> {
  const result: PaymentSweepResult = { expiredPayments: 0, cancelledBookings: 0, deletedHistory: 0 };
  const nowMs = now.getTime();

  // 1) pending เกิน 1 วัน → cancelled (+ แจ้งเตือน + ยกเลิก booking ค้าง)
  const pendingSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('status', '==', 'pending')
    .limit(200)
    .get();
  for (const doc of pendingSnap.docs) {
    const payment = doc.data();
    if (paymentDeadlineMs(payment) > nowMs) continue;
    await doc.ref.update({
      status: 'cancelled',
      note: 'payment_expired_1day',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    result.expiredPayments += 1;

    try {
      await db.collection(COLLECTIONS.NOTIFICATIONS).add({
        userId: payment.parentId,
        type: 'payment',
        title: 'รายการชำระเงินหมดอายุ',
        body: `รายการชำระเงินของ ${payment.studentName || 'นักเรียน'} ไม่ได้รับการชำระภายใน 1 วัน จึงถูกยกเลิกอัตโนมัติ กรุณาจองใหม่อีกครั้ง`,
        data: { bookingId: payment.bookingId || null, paymentId: doc.id },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('payment expiry notification failed:', error instanceof Error ? error.message : 'unknown');
    }

    // booking ที่ยังรอชำระค้าง → ยกเลิกตาม (ไม่แตะรายการ confirmed/completed)
    const bookingId = payment.bookingId;
    if (bookingId) {
      const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(bookingId);
      const bookingSnap = await bookingRef.get();
      if (bookingSnap.exists && bookingSnap.data()?.status === 'pending') {
        await bookingRef.update({
          status: 'cancelled',
          cancelledAt: Timestamp.fromMillis(nowMs),
          cancelReason: 'payment_expired',
          updatedAt: Timestamp.fromMillis(nowMs),
        });
        result.cancelledBookings += 1;
      }
    }
  }

  // 2) cancelled เกิน 3 วัน → ลบ (ประวัติหาย)
  const cancelledSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('status', '==', 'cancelled')
    .limit(200)
    .get();
  for (const doc of cancelledSnap.docs) {
    if (nowMs < cancelledCleanupMs(doc.data())) continue;
    await doc.ref.delete();
    result.deletedHistory += 1;
  }

  return result;
}
