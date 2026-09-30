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
//
// Pagination: วนทีละหน้า (PAGE_SIZE) ด้วย cursor จนหมด backlog — ไม่ตัดที่ 200
// แต่จำกัด MAX_PAGES ต่อรอบกัน runtime ยาวเกิน (ที่เหลือรอบหน้าจะเก็บต่อเอง)
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

/** รายการ pending รอได้ไม่เกิน 1 วัน */
export const PENDING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;
/** รายการยกเลิกถูกซ่อน/ลบหลังจาก 3 วัน */
export const CANCELLED_HISTORY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** ขนาดหน้าต่อการ query หนึ่งรอบ */
export const SWEEP_PAGE_SIZE = 200;
/** จำนวนหน้าสูงสุดต่อการ sweep หนึ่งรอบ (200 × 25 = 5,000 รายการ/รอบ) */
export const SWEEP_MAX_PAGES = 25;

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
  pagesScanned: { pending: number; cancelled: number }; // จำนวนหน้าที่สแกน (observability)
  truncated: boolean;        // true = ครบ MAX_PAGES แต่ยังมี backlog เหลือ (รอบหน้าเก็บต่อ)
}

/** ยกเลิก payment 1 รายการแบบ atomic (คืน false ถ้าสถานะเปลี่ยนไปแล้ว) */
async function expireOnePayment(db: any, docRef: any): Promise<boolean> {
  return db.runTransaction(async (tx: any) => {
    const fresh = await tx.get(docRef);
    if (fresh.data()?.status !== 'pending') return false;
    tx.update(docRef, {
      status: 'cancelled',
      note: 'payment_expired_1day',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/** ยกเลิก booking ที่ยัง pending ค้างตาม payment (แบบ atomic — ไม่แตะ confirmed/completed) */
async function cancelPendingBooking(db: any, bookingId: string, nowMs: number): Promise<boolean> {
  const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx: any) => {
    const fresh = await tx.get(bookingRef);
    if (!fresh.exists || fresh.data()?.status !== 'pending') return false;
    tx.update(bookingRef, {
      status: 'cancelled',
      cancelledAt: Timestamp.fromMillis(nowMs),
      cancelReason: 'payment_expired',
      updatedAt: Timestamp.fromMillis(nowMs),
    });
    return true;
  });
}

async function notifyPaymentExpired(db: any, payment: any, paymentId: string) {
  try {
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: payment.parentId,
      type: 'payment',
      title: 'รายการชำระเงินหมดอายุ',
      body: `รายการชำระเงินของ ${payment.studentName || 'นักเรียน'} ไม่ได้รับการชำระภายใน 1 วัน จึงถูกยกเลิกอัตโนมัติ กรุณาจองใหม่อีกครั้ง`,
      data: { bookingId: payment.bookingId || null, paymentId },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('payment expiry notification failed:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * กวาดรายการค้างทั้งระบบ — idempotent (ยกเลิกภายใน transaction ที่อ่านสดก่อนเขียน)
 * ห้ามเรียกจาก client ตรง ๆ — server components/scheduled function เท่านั้น
 */
export async function sweepExpiredPayments(db: any, now: Date = new Date()): Promise<PaymentSweepResult> {
  const result: PaymentSweepResult = {
    expiredPayments: 0,
    cancelledBookings: 0,
    deletedHistory: 0,
    pagesScanned: { pending: 0, cancelled: 0 },
    truncated: false,
  };
  const nowMs = now.getTime();

  // ── 1) pending เกิน 1 วัน → cancelled (+ แจ้งเตือน + ยกเลิก booking ค้าง) ──
  {
    let cursor: any = null;
    for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
      let query = db.collection(COLLECTIONS.PAYMENTS)
        .where('status', '==', 'pending')
        .limit(SWEEP_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      result.pagesScanned.pending += 1;

      for (const doc of snap.docs) {
        const payment = doc.data();
        if (paymentDeadlineMs(payment) > nowMs) continue; // ยังไม่หมดอายุ — ข้าม
        const cancelledNow = await expireOnePayment(db, doc.ref);
        if (!cancelledNow) continue; // ถูกชำระ/เปลี่ยนสถานะพอดีระหว่างรัน
        result.expiredPayments += 1;
        await notifyPaymentExpired(db, payment, doc.id);
        if (payment.bookingId) {
          const done = await cancelPendingBooking(db, payment.bookingId, nowMs);
          if (done) result.cancelledBookings += 1;
        }
      }

      if (snap.size < SWEEP_PAGE_SIZE) break; // หน้าสุดท้าย — หมด backlog
      cursor = snap.docs[snap.docs.length - 1];
      if (page === SWEEP_MAX_PAGES - 1) result.truncated = true;
    }
  }

  // ── 2) cancelled เกิน 3 วัน → ลบ (ประวัติหาย) ──
  {
    let cursor: any = null;
    for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
      let query = db.collection(COLLECTIONS.PAYMENTS)
        .where('status', '==', 'cancelled')
        .limit(SWEEP_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      result.pagesScanned.cancelled += 1;

      for (const doc of snap.docs) {
        if (nowMs < cancelledCleanupMs(doc.data())) continue;
        await doc.ref.delete();
        result.deletedHistory += 1;
      }

      if (snap.size < SWEEP_PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
      if (page === SWEEP_MAX_PAGES - 1) result.truncated = true;
    }
  }

  return result;
}
