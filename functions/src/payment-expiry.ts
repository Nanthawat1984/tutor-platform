// Scheduled payment sweep — ยกเลิกรายการรอชำระเกิน 1 วัน + เก็บกวาดประวัติยกเลิกเกิน 3 วัน
//
// NOTE: logic นี้ mirror กับ src/lib/payments/expiry.ts (lazy sweep ในหน้าประวัติ)
// เขียนซ้ำไว้ตรงนี้เพราะ functions ต้อง self-contained (rootDir: src — ห้าม import ข้าม)
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

let _db: FirebaseFirestore.Firestore | null = null;
function getDb(): FirebaseFirestore.Firestore {
  if (!_db) {
    const app = admin.initializeApp();
    _db = getFirestore(app, 'tutor');
  }
  return _db;
}

const PENDING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000; // รอชำระได้ไม่เกิน 1 วัน
const CANCELLED_HISTORY_TTL_MS = 3 * 24 * 60 * 60 * 1000; // ประวัติยกเลิกหายใน 3 วัน

function deadlineMs(payment: FirebaseFirestore.DocumentData): number {
  const byExpiresAt = (payment.expiresAt as Timestamp | undefined)?.toMillis?.();
  if (typeof byExpiresAt === 'number') return byExpiresAt;
  const created = (payment.createdAt as Timestamp | undefined)?.toMillis?.() || 0;
  return created + PENDING_PAYMENT_TTL_MS;
}

function cleanupMs(payment: FirebaseFirestore.DocumentData): number {
  const cancelled = (payment.cancelledAt as Timestamp | undefined)?.toMillis?.()
    ?? (payment.updatedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
  return cancelled + CANCELLED_HISTORY_TTL_MS;
}

export const scheduledPaymentSweep = functions
  .region('asia-southeast1')
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .pubsub
  .schedule('every 60 minutes')
  .timeZone('Asia/Bangkok')
  .onRun(async () => {
    const db = getDb();
    const nowMs = Date.now();
    let expired = 0, cancelledBookings = 0, deleted = 0;

    // 1) pending เกิน 1 วัน → cancelled + แจ้งเตือน + ยกเลิก booking pending ค้าง
    const pendingSnap = await db.collection('payments').where('status', '==', 'pending').limit(200).get();
    for (const doc of pendingSnap.docs) {
      if (deadlineMs(doc.data()) > nowMs) continue;
      const payment = doc.data();
      await doc.ref.update({
        status: 'cancelled',
        note: 'payment_expired_1day',
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      expired += 1;
      try {
        await db.collection('notifications').add({
          userId: payment.parentId,
          type: 'payment',
          title: 'รายการชำระเงินหมดอายุ',
          body: `รายการชำระเงินของ ${payment.studentName || 'นักเรียน'} ไม่ได้รับการชำระภายใน 1 วัน จึงถูกยกเลิกอัตโนมัติ กรุณาจองใหม่อีกครั้ง`,
          data: { bookingId: payment.bookingId || null, paymentId: doc.id },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('expiry notification failed:', e instanceof Error ? e.message : e);
      }
      if (payment.bookingId) {
        const bookingRef = db.collection('bookings').doc(payment.bookingId);
        const bookingSnap = await bookingRef.get();
        if (bookingSnap.exists && bookingSnap.data()?.status === 'pending') {
          await bookingRef.update({
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelReason: 'payment_expired',
            updatedAt: FieldValue.serverTimestamp(),
          });
          cancelledBookings += 1;
        }
      }
    }

    // 2) cancelled เกิน 3 วัน → ลบออกจาก DB (ประวัติหายตามนโยบาย)
    const cancelledSnap = await db.collection('payments').where('status', '==', 'cancelled').limit(200).get();
    for (const doc of cancelledSnap.docs) {
      if (nowMs < cleanupMs(doc.data())) continue;
      await doc.ref.delete();
      deleted += 1;
    }

    if (expired || cancelledBookings || deleted) {
      console.log('[payment-sweep]', { expiredPayments: expired, cancelledBookings, deletedHistory: deleted });
    }
    return null;
  });
