// Payment business logic (server-side — ใช้ Firebase Admin SDK)
// ที่เดียวที่จัดการ "เมื่อชำระเงินสำเร็จ" → ยืนยันการจอง + escrow + แจ้งเตือน
// ทั้ง API route ในแอป และ (mirror) ใน Cloud Functions ใช้ logic เดียวกันนี้
//
// หลักการกัน double-process:
//   - markPaymentPaid ตั้ง escrowProcessed=true บน payment
//   - Cloud Function trigger onPaymentStatusChange จะข้ามถ้าเห็น escrowProcessed=true
//   - ดังนั้นประมวลผลครั้งเดียวแน่นอน ไม่ว่าจะ path ไหนทำงานก่อน

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import { computeFees } from './config';

type AdminFirestore = Firestore;

// ─────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────
export async function getOrCreateWallet(db: AdminFirestore, teacherId: string) {
  const ref = db.collection(COLLECTIONS.WALLETS).doc(teacherId);
  const snap = await ref.get();
  if (snap.exists) {
    return { ref, data: snap.data() as any, created: false };
  }
  await ref.set({
    teacherId,
    pendingBalance: 0,
    availableBalance: 0,
    totalEarned: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {
    ref,
    data: { teacherId, pendingBalance: 0, availableBalance: 0, totalEarned: 0 } as any,
    created: true,
  };
}

// ─────────────────────────────────────────────
// CREATE PAYMENT (เมื่อผู้ปกครองจอง)
// ─────────────────────────────────────────────
export async function createPaymentForBooking(
  db: AdminFirestore,
  booking: any,
  opts: { method?: string } = {},
) {
  const { fees, netAmount } = computeFees(Number(booking.totalPrice) || 0);
  const ref = await db.collection(COLLECTIONS.PAYMENTS).add({
    bookingId: booking.id,
    parentId: booking.parentId,
    teacherId: booking.teacherId,
    studentName: booking.studentName || '',
    courseTitle: booking.courseTitle || '',
    amount: Number(booking.totalPrice) || 0,
    fees,
    netAmount,
    currency: 'THB',
    method: opts.method || 'promptpay',
    status: 'pending',
    escrowProcessed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, fees, netAmount };
}

export async function getPaymentForBooking(db: AdminFirestore, bookingId: string) {
  // Avoid composite index (bookingId + createdAt) — sort in memory instead.
  // There's typically only one payment per booking, so this is cheap.
  const snap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('bookingId', '==', bookingId)
    .limit(10)
    .get();
  if (snap.empty) return null;
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
  return docs[0] || null;
}

// ─────────────────────────────────────────────
// MARK PAYMENT PAID  ← หัวใจของระบบ
// 1. ตั้ง payment = paid (+ transactionId, paidAt, escrowProcessed)
// 2. ยืนยันการจอง (ถ้ายัง pending)
// 3. escrow: เติม pendingBalance ของครู (เฉพาะครั้งแรก — กันซ้ำ)
// 4. แจ้งเตือนผู้ปกครอง
// ─────────────────────────────────────────────
export function generateReceiptNumber(paymentId: string, issuedAt: Date = new Date()): string {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(issuedAt);
  const date = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const suffix = paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase().padStart(8, '0');
  return `TF-RC-${date.year}${date.month}${date.day}-${suffix}`;
}

export async function markPaymentPaid(
  db: AdminFirestore,
  paymentId: string,
  opts: { transactionId?: string; providerRef?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) return { ok: false, reason: 'payment_not_found' };
  const payment = paymentSnap.data() as any;
  if (payment.status === 'paid') {
    if (!payment.receiptNumber) {
      await paymentRef.update({
        receiptNumber: generateReceiptNumber(paymentId),
        receiptIssuedAt: payment.receiptIssuedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { ok: true, reason: 'already_paid' };
  }

  // กันประมวลผลซ้ำ — ถ้ามี escrowProcessed=true แปลว่าทำไปแล้ว
  if (payment.escrowProcessed) return { ok: true, reason: 'already_processed' };

  const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(payment.bookingId);
  const bookingSnap = await bookingRef.get();
  const booking = bookingSnap.exists ? bookingSnap.data() as any : null;

  const netAmount = Number(payment.netAmount) || 0;
  const teacherId = payment.teacherId;

  // 1) payment → paid
  await paymentRef.update({
    status: 'paid',
    transactionId: opts.transactionId || payment.transactionId || null,
    providerRef: opts.providerRef || payment.providerRef || null,
    paidAt: FieldValue.serverTimestamp(),
    receiptNumber: payment.receiptNumber || generateReceiptNumber(paymentId),
    receiptIssuedAt: payment.receiptIssuedAt || FieldValue.serverTimestamp(),
    escrowProcessed: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2) ยืนยันการจอง (ถ้ายัง pending)
  let wasPending = false;
  if (booking && booking.status === 'pending') {
    wasPending = true;
    await bookingRef.update({
      status: 'confirmed',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 3) escrow — เติม wallet pending ของครู (ครั้งแรกที่จ่าย)
  if (teacherId && netAmount > 0 && wasPending) {
    const wallet = await getOrCreateWallet(db, teacherId);
    await wallet.ref.update({
      pendingBalance: FieldValue.increment(netAmount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 4) แจ้งเตือนผู้ปกครอง
  try {
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: payment.parentId,
      type: 'payment',
      title: 'ชำระเงินสำเร็จ',
      body: `การจองเรียนของ ${payment.studentName || 'นักเรียน'} ได้รับการยืนยันแล้ว (${payment.amount} บาท)`,
      data: { bookingId: payment.bookingId, paymentId },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('notify failed:', e);
  }

  return { ok: true };
}

// ─────────────────────────────────────────────
// MARK PAYMENT FAILED / CANCELLED
// ─────────────────────────────────────────────
export async function markPaymentFailed(db: AdminFirestore, paymentId: string, reason?: string) {
  await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
    status: 'failed',
    note: reason || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function cancelPendingPayment(db: AdminFirestore, paymentId: string) {
  await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Cancel a Stripe Checkout payment after its session expires.
 * This transition is deliberately pending-only: a late/duplicate expiry
 * event must never undo a payment that already became paid.
 */
export async function markPaymentExpired(
  db: AdminFirestore,
  paymentId: string,
  opts: { providerRef?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) return { ok: false, reason: 'payment_not_found' };

  const payment = paymentSnap.data() as any;
  if (opts.providerRef && payment.providerRef && opts.providerRef !== payment.providerRef) {
    return { ok: false, reason: 'provider_mismatch' };
  }
  if (payment.status !== 'pending') {
    return { ok: true, reason: `already_${payment.status}` };
  }

  await paymentRef.update({
    status: 'cancelled',
    note: 'stripe_checkout_expired',
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: payment.parentId,
      type: 'payment',
      title: 'รายการชำระเงินหมดอายุ',
      body: `รายการชำระเงินของ ${payment.studentName || 'นักเรียน'} หมดเวลาแล้ว กรุณาเริ่มชำระเงินใหม่`,
      data: {
        bookingId: payment.bookingId,
        paymentId,
        receiptNumber: payment.receiptNumber || generateReceiptNumber(paymentId),
      },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('payment expiry notification failed:', error instanceof Error ? error.message : 'unknown');
  }

  return { ok: true };
}

// ─────────────────────────────────────────────
// RELEASE ESCROW — เมื่อ booking เสร็จสมบูรณ์
// ย้าย pendingBalance → availableBalance ของครู
// + หักภาษี ณ ที่จ่าย 3% (ม.3 ทวิ / ภ.ง.ด.53) ของเงินได้สุทธิที่จ่ายให้ครู
// ─────────────────────────────────────────────
export const TAX_WITHHOLDING_RATE = 0.03;

export async function releaseEscrowForBooking(
  db: AdminFirestore,
  bookingId: string,
): Promise<void> {
  const payment = await getPaymentForBooking(db, bookingId);
  if (!payment || payment.status !== 'paid' || !payment.teacherId) return;
  const netAmount = Number(payment.netAmount) || 0;
  if (netAmount <= 0) return;

  // หัก ณ ที่จ่าย 3% ของเงินได้สุทธิ (ครูบุคคลธรรมดา) — ปัดเป็นสตางค์
  const taxWithheld = Math.round(netAmount * TAX_WITHHOLDING_RATE * 100) / 100;
  const payoutAmount = netAmount - taxWithheld;

  // บันทึกผลการหักลง payment doc (ใช้ทำ 50 ทวิ / ภ.ง.ด.53)
  await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
    taxWithheld,
    payoutAmount,
    taxWithheldAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const wallet = await getOrCreateWallet(db, payment.teacherId);
  await wallet.ref.update({
    pendingBalance: FieldValue.increment(-netAmount),
    availableBalance: FieldValue.increment(payoutAmount),
    totalEarned: FieldValue.increment(payoutAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
// REFUND — คืนเงินเมื่อยกเลิก (escrow)
// ─────────────────────────────────────────────
export async function refundPayment(db: AdminFirestore, paymentId: string) {
  const paymentSnap = await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();
  if (!paymentSnap.exists) return { ok: false, reason: 'not_found' };
  const payment = paymentSnap.data() as any;
  if (payment.status !== 'paid') return { ok: false, reason: 'not_paid' };

  const netAmount = Number(payment.netAmount) || 0;
  const teacherId = payment.teacherId;

  await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
    status: 'refunded',
    updatedAt: FieldValue.serverTimestamp(),
  });

  // ลด pending balance ของครู
  if (teacherId && netAmount > 0) {
    const walletRef = db.collection(COLLECTIONS.WALLETS).doc(teacherId);
    const walletSnap = await walletRef.get();
    if (walletSnap.exists) {
      await walletRef.update({
        pendingBalance: FieldValue.increment(-netAmount),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // ยกเลิกการจอง
  const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(payment.bookingId);
  const bookingSnap = await bookingRef.get();
  if (bookingSnap.exists && (bookingSnap.data() as any).status === 'confirmed') {
    await bookingRef.update({
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { ok: true };
}

export type { Transaction };
