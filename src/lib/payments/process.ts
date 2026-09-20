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
  opts: { method?: string; couponCode?: string | null; couponId?: string | null; discountAmount?: number } = {},
) {
  const gross = Number(booking.totalPrice) || 0;
  const discount = Math.max(0, Math.min(Number(opts.discountAmount) || 0, gross));
  const amount = gross - discount;
  const { fees, netAmount } = computeFees(amount);
  const ref = await db.collection(COLLECTIONS.PAYMENTS).add({
    bookingId: booking.id,
    parentId: booking.parentId,
    teacherId: booking.teacherId,
    studentName: booking.studentName || '',
    courseTitle: booking.courseTitle || '',
    amount,
    fees,
    netAmount,
    currency: 'THB',
    method: opts.method || 'promptpay',
    status: 'pending',
    kind: 'session',
    couponCode: opts.couponCode || null,
    couponId: opts.couponId || null,
    discountAmount: discount,
    walletApplied: 0,
    escrowProcessed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, fees, netAmount, amount, discount };
}

/**
 * สร้าง payment สำหรับซื้อแพ็กเกจ (kind='package', bookingId=null)
 * เรียกจาก /api/packages/purchase เท่านั้น — validator อยู่ฝั่งนั้น
 */
export async function createPaymentForPackage(
  db: AdminFirestore,
  input: {
    packageId: string;
    purchaseId: string;
    parentId: string;
    parentName?: string;
    teacherId: string;
    courseTitle: string;
    studentName?: string;
    amount: number;
    method?: string;
    couponCode?: string | null;
    couponId?: string | null;
    discountAmount?: number;
    walletApplied?: number;
  },
) {
  const { fees, netAmount } = computeFees(Number(input.amount) || 0);
  const ref = await db.collection(COLLECTIONS.PAYMENTS).add({
    bookingId: null,
    kind: 'package',
    packageId: input.packageId,
    packagePurchaseId: input.purchaseId,
    parentId: input.parentId,
    teacherId: input.teacherId,
    studentName: input.studentName || '',
    courseTitle: input.courseTitle || '',
    amount: Number(input.amount) || 0,
    fees,
    netAmount,
    currency: 'THB',
    method: (input.method as any) || 'promptpay',
    provider: 'mock',
    status: 'pending',
    couponCode: input.couponCode || null,
    couponId: input.couponId || null,
    discountAmount: Number(input.discountAmount) || 0,
    walletApplied: Number(input.walletApplied) || 0,
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

  // ── แพ็กเกจ: กระจายไป markPackagePaymentPaid (เปิดเครดิต + เติม escrow รวมครั้งเดียว) ──
  if (payment.kind === 'package') {
    return markPackagePaymentPaid(db, paymentId, opts);
  }

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

  // 3b) หัก wallet ที่ใช้ร่วมจ่าย (กันซ้ำด้วย walletDeducted)
  if (Number(payment.walletApplied) > 0 && !payment.walletDeducted) {
    try {
      const { debitParentWallet } = await import('@/lib/parent-wallet');
      const debited = await debitParentWallet(db, {
        parentId: payment.parentId,
        amount: Number(payment.walletApplied),
        kind: 'spend',
        bookingId: payment.bookingId || null,
        paymentId,
        note: 'ใช้เครดิตชำระค่าคอร์ส',
      });
      if (debited.ok) {
        await paymentRef.update({ walletDeducted: true, updatedAt: FieldValue.serverTimestamp() });
      } else {
        console.error('wallet debit failed:', debited.reason);
      }
    } catch (e) {
      console.error('wallet debit failed:', e);
    }
  }

  // 3c) consume คูปอง (ถ้าจองครั้งนี้ใช้คูปอง — กันซ้ำด้วย couponConsumed)
  if (payment.couponId && !payment.couponConsumed) {
    try {
      await db.collection('coupons').doc(payment.couponId).update({
        usedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await paymentRef.update({ couponConsumed: true, updatedAt: FieldValue.serverTimestamp() });
    } catch (e) {
      console.error('coupon consume failed:', e);
    }
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
// MARK PACKAGE PAYMENT PAID — ซื้อแพ็กเกจสำเร็จ
// 1. payment → paid (+ใบเสร็จ)
// 2. purchase → active + เขียน credit ledger (ครั้งแรก — กันซ้ำ)
// 3. escrow รวมครั้งเดียว: เติม pendingBalance ครูด้วย netAmount ทั้งก้อน
//    (ปล่อยทีละครั้งตอนเช็คชื่อผ่าน releasePackageSessionEscrow)
// 4. consume คูปอง (ถ้ามี — increment usedCount ครั้งเดียว)
// 5. แจ้งเตือนผู้ปกครอง
// ─────────────────────────────────────────────
export async function markPackagePaymentPaid(
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
  if (payment.escrowProcessed) return { ok: true, reason: 'already_processed' };
  if (payment.kind !== 'package' || !payment.packagePurchaseId) {
    return { ok: false, reason: 'not_package_payment' };
  }

  const purchaseRef = db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(payment.packagePurchaseId);
  const purchaseSnap = await purchaseRef.get();
  if (!purchaseSnap.exists) return { ok: false, reason: 'purchase_not_found' };
  const purchase = purchaseSnap.data() as any;
  if (purchase.parentId !== payment.parentId) return { ok: false, reason: 'owner_mismatch' };

  const netAmount = Number(payment.netAmount) || 0;
  const teacherId = payment.teacherId;
  const sessionsTotal = Number(purchase.sessionsTotal) || 0;

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

  // purchase → active + ledger (guard: ทำเฉพาะครั้งแรก)
  if (purchase.status === 'pending') {
    const perSession = sessionsTotal > 0 ? Math.floor((netAmount / sessionsTotal) * 100) / 100 : 0;
    await purchaseRef.update({
      status: 'active',
      amount: Number(payment.amount) || 0,
      fees: Number(payment.fees) || 0,
      netAmount,
      perSessionNet: perSession,
      paymentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection(COLLECTIONS.CREDIT_TRANSACTIONS).add({
      purchaseId: purchaseRef.id,
      parentId: payment.parentId,
      teacherId,
      bookingId: null,
      kind: 'purchase',
      sessionsDelta: sessionsTotal,
      balanceAfter: sessionsTotal,
      createdAt: FieldValue.serverTimestamp(),
    });
    // escrow รวม: เติม pending ครูครั้งเดียวตอนซื้อ
    if (teacherId && netAmount > 0) {
      const wallet = await getOrCreateWallet(db, teacherId);
      await wallet.ref.update({
        pendingBalance: FieldValue.increment(netAmount),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // consume คูปอง (กันซ้ำด้วย payment.couponConsumed)
  if (payment.couponId && !payment.couponConsumed) {
    try {
      await db.collection('coupons').doc(payment.couponId).update({
        usedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await paymentRef.update({ couponConsumed: true, updatedAt: FieldValue.serverTimestamp() });
    } catch (e) {
      console.error('coupon consume failed:', e);
    }
  }

  // หัก wallet ที่ใช้ร่วมจ่าย (กันซ้ำด้วย payment.walletDeducted)
  if (Number(payment.walletApplied) > 0 && !payment.walletDeducted) {
    const { debitParentWallet } = await import('@/lib/parent-wallet');
    const res = await debitParentWallet(db, {
      parentId: payment.parentId,
      amount: Number(payment.walletApplied),
      kind: 'spend',
      paymentId,
      note: 'ใช้เครดิตชำระค่าแพ็กเกจ',
    });
    if (res.ok) {
      await paymentRef.update({ walletDeducted: true, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  try {
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      userId: payment.parentId,
      type: 'payment',
      title: 'ซื้อแพ็กเกจสำเร็จ',
      body: `แพ็กเกจ ${purchase.packageTitle || 'เรียน'} พร้อมใช้ ${sessionsTotal} ครั้งแล้ว จองครั้งต่อไปได้เลยโดยไม่ต้องจ่ายใหม่`,
      data: { purchaseId: purchaseRef.id, paymentId },
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
// เกณฑ์หักภาษี ณ ที่จ่าย — ค่าจ้างทำของ/ค่าบริการที่จ่ายให้บุคคลธรรมดา
// หักเมื่อจ่ายคราวละ 1,000 บาทขึ้นไป (ท.ป. 4/2528 ข้อ 6) ต่ำกว่านั้นไม่ต้องหัก
// แต่ยังบันทึกว่าได้รับยกเว้น (taxWithheld=0 + taxExemptReason) เพื่อกระทบยอด
export const TAX_WITHHOLDING_THRESHOLD = 1000;

export async function releaseEscrowForBooking(
  db: AdminFirestore,
  bookingId: string,
): Promise<void> {
  const payment = await getPaymentForBooking(db, bookingId);
  if (!payment || payment.status !== 'paid' || !payment.teacherId) return;
  // Idempotency — release writes taxWithheldAt/payoutAmount markers below.
  // A second call (double-click, retry, trigger race) must be a no-op so the
  // wallet is credited exactly once. Mirrors functions releaseEscrow.
  if (payment.taxWithheldAt !== undefined || payment.payoutAmount !== undefined) return;
  const netAmount = Number(payment.netAmount) || 0;
  if (netAmount <= 0) return;

  // ต่ำกว่า 1,000 บาทไม่ต้องหัก — บันทึกยกเว้นไว้กระทบยอด (ไม่เข้า 50 ทวิ)
  const belowThreshold = netAmount < TAX_WITHHOLDING_THRESHOLD;
  // หัก ณ ที่จ่าย 3% ของเงินได้สุทธิ (ครูบุคคลธรรมดา) — ปัดเป็นสตางค์
  const taxWithheld = belowThreshold ? 0 : Math.round(netAmount * TAX_WITHHOLDING_RATE * 100) / 100;
  const payoutAmount = netAmount - taxWithheld;

  // บันทึกผลการหักลง payment doc (ใช้ทำ 50 ทวิ / ภ.ง.ด.53)
  await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
    taxWithheld,
    payoutAmount,
    taxExemptReason: belowThreshold ? 'below_threshold_1000' : null,
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
