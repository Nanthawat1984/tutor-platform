// Scheduled payment sweep — ยกเลิกรายการรอชำระเกิน 1 วัน + เก็บกวาดประวัติยกเลิกเกิน 3 วัน
//
// NOTE: logic นี้ mirror กับ src/lib/payments/expiry.ts (lazy sweep ในหน้าประวัติ)
// เขียนซ้ำไว้ตรงนี้เพราะ functions ต้อง self-contained (rootDir: src — ห้าม import ข้าม)
//
// Race guard: ยกเลิกภายใน transaction ที่อ่านสดก่อนเขียน — ไม่ทับรายการที่
// ผู้ปกครองชำระ "พอดี" ระหว่างที่ sweep กำลังรัน
//
// Pagination: วนทีละหน้าด้วย cursor จนหมด backlog — จำกัด MAX_PAGES ต่อรอบ
// กัน runtime ยาวเกิน (ที่เหลือรอบถัดไปเก็บต่อเอง — รันทุกชั่วโมง)
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
const PAGE_SIZE = 200;
const MAX_PAGES = 25; // สูงสุด 5,000 รายการ/รอบ

function deadlineMs(payment: FirebaseFirestore.DocumentData): number {
  const created = (payment.createdAt as Timestamp | undefined)?.toMillis?.() || 0;
  return created + PENDING_PAYMENT_TTL_MS;
}

function cleanupMs(payment: FirebaseFirestore.DocumentData): number {
  const cancelled = (payment.cancelledAt as Timestamp | undefined)?.toMillis?.()
    ?? (payment.updatedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
  return cancelled + CANCELLED_HISTORY_TTL_MS;
}

/** ยกเลิก payment 1 รายการแบบ atomic (คืน false ถ้าสถานะเปลี่ยนไปแล้ว) */
async function expireOnePayment(db: FirebaseFirestore.Firestore, ref: FirebaseFirestore.DocumentReference): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== 'pending') return false;
    tx.update(ref, {
      status: 'cancelled',
      note: 'payment_expired_1day',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/** ยกเลิก booking ที่ยัง pending ค้างตาม payment (แบบ atomic) */
async function cancelPendingBooking(db: FirebaseFirestore.Firestore, bookingId: string, nowMs: number): Promise<boolean> {
  const ref = db.collection('bookings').doc(bookingId);
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data()?.status !== 'pending') return false;
    tx.update(ref, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: 'payment_expired',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export const scheduledPaymentSweep = functions
  .region('asia-southeast1')
  .runWith({ memory: '256MB', timeoutSeconds: 540 })
  .pubsub
  .schedule('every 60 minutes')
  .timeZone('Asia/Bangkok')
  .onRun(async () => {
    const db = getDb();
    const nowMs = Date.now();
    let expired = 0, cancelledBookings = 0, deleted = 0, truncated = false;

    // ── 1) pending เกิน 1 วัน → cancelled + แจ้งเตือน + ยกเลิก booking ค้าง ──
    let pendingCursor: FirebaseFirestore.DocumentSnapshot | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = db.collection('payments').where('status', '==', 'pending').limit(PAGE_SIZE);
      if (pendingCursor) q = q.startAfter(pendingCursor);
      const snap = await q.get();

      for (const doc of snap.docs) {
        if (deadlineMs(doc.data()) > nowMs) continue;
        const payment = doc.data();
        const done = await expireOnePayment(db, doc.ref);
        if (!done) continue;
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
          const ok = await cancelPendingBooking(db, payment.bookingId, nowMs);
          if (ok) cancelledBookings += 1;
        }
      }

      if (snap.size < PAGE_SIZE) break;
      pendingCursor = snap.docs[snap.docs.length - 1];
      if (page === MAX_PAGES - 1) truncated = true;
    }

    // ── 2) cancelled เกิน 3 วัน → ลบออกจาก DB (ประวัติหายตามนโยบาย) ──
    let cancelledCursor: FirebaseFirestore.DocumentSnapshot | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = db.collection('payments').where('status', '==', 'cancelled').limit(PAGE_SIZE);
      if (cancelledCursor) q = q.startAfter(cancelledCursor);
      const snap = await q.get();

      for (const doc of snap.docs) {
        if (nowMs < cleanupMs(doc.data())) continue;
        await doc.ref.delete();
        deleted += 1;
      }

      if (snap.size < PAGE_SIZE) break;
      cancelledCursor = snap.docs[snap.docs.length - 1];
      if (page === MAX_PAGES - 1) truncated = true;
    }

    if (expired || cancelledBookings || deleted || truncated) {
      console.log('[payment-sweep]', { expiredPayments: expired, cancelledBookings, deletedHistory: deleted, truncated });
    }
    return null;
  });
