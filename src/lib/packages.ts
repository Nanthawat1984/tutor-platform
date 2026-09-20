// Package purchase + credit ledger (server-side, Admin SDK)
// จ่ายครั้งเดียว → ได้เครดิต N ครั้ง → จองทีละครั้งโดยหักเครดิต (ไม่ต้องจ่ายใหม่)
// ปล่อย escrow ให้ครูทีละครั้งตอนเช็คชื่อ (reuse กติกาเดิม: เฉพาะ attendance=present)

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import { computeFees, PLATFORM_FEE_RATE } from '@/lib/payments/config';
import { getOrCreateWallet, TAX_WITHHOLDING_RATE, TAX_WITHHOLDING_THRESHOLD } from './payments/process';
import {
  buildAvailableBookingSlots,
  type AvailabilityBooking,
  type AvailabilitySchedule,
} from '@/lib/booking/availability';

export const LOW_CREDIT_THRESHOLD = 2; // เหลือ ≤ 2 ครั้ง → แจ้งเตือนชวนต่อแพ็กเกจ

export function packagePriceBreakdown(pricePerSession: number, sessionsTotal: number) {
  const list = Math.max(0, Math.round(Number(pricePerSession) || 0)) * Math.max(1, Math.round(sessionsTotal));
  return { list };
}

export function computePackageTotals(priceTotal: number) {
  const amount = Math.max(0, Math.round(Number(priceTotal) || 0));
  const { fees, netAmount } = computeFees(amount);
  return { amount, fees, netAmount };
}

/** per-session net ที่จะปล่อยให้ครูทีละครั้ง (ปัดทศนิยมกระจายให้ยอดรวมตรง) */
export function perSessionNetOf(netTotal: number, sessionsTotal: number): number {
  const n = Math.max(1, Math.round(sessionsTotal));
  return Math.floor((Number(netTotal) || 0) / n * 100) / 100;
}

/**
 * สร้าง purchase record หลังชำระเงินแพ็กเกจสำเร็จ (เรียกจาก markPackagePaymentPaid เท่านั้น)
 */
export async function activatePackagePurchase(
  db: Firestore,
  purchaseRef: any,
  payment: any,
  pkg: any,
): Promise<void> {
  const { fees, netAmount } = computePackageTotals(Number(payment.amount) || 0);
  const sessionsTotal = Number(pkg.sessionsTotal) || 0;
  await purchaseRef.update({
    status: 'active',
    amount: Number(payment.amount) || 0,
    fees,
    netAmount,
    perSessionNet: perSessionNetOf(netAmount, sessionsTotal),
    paymentId: payment.id || payment.paymentId || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection(COLLECTIONS.CREDIT_TRANSACTIONS).add({
    purchaseId: purchaseRef.id,
    parentId: payment.parentId,
    teacherId: payment.teacherId,
    bookingId: null,
    kind: 'purchase',
    sessionsDelta: sessionsTotal,
    balanceAfter: sessionsTotal,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * หักเครดิต 1 ครั้งเพื่อจอง (atomic — กันใช้เครดิตเกินเมื่อกดพร้อมกัน)
 * คืน ok=false เมื่อเครดิตไม่พอ/สถานะไม่ถูกต้อง
 */
export async function consumePackageCredit(
  db: Firestore,
  purchaseId: string,
  bookingId: string,
): Promise<{ ok: boolean; reason?: string; remaining?: number }> {
  const ref = db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId);
  try {
    const remaining = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('purchase_not_found');
      const p = snap.data() as any;
      if (p.status !== 'active') throw new Error(`purchase_${p.status}`);
      const left = Number(p.sessionsRemaining ?? ((Number(p.sessionsTotal) || 0) - (Number(p.sessionsUsed) || 0) || 0));
      if (left < 1) {
        if (p.status === 'active') tx.update(ref, { status: 'depleted', updatedAt: FieldValue.serverTimestamp() });
        throw new Error('insufficient_credit');
      }
      const used = (Number(p.sessionsUsed) || 0) + 1;
      const nextRemaining = left - 1;
      tx.update(ref, {
        sessionsUsed: used,
        sessionsRemaining: nextRemaining,
        status: nextRemaining <= 0 ? 'depleted' : 'active',
        lowCreditNotified: nextRemaining <= LOW_CREDIT_THRESHOLD ? true : (p.lowCreditNotified || false),
        depletedNotified: nextRemaining <= 0 ? true : (p.depletedNotified || false),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const txRef = db.collection(COLLECTIONS.CREDIT_TRANSACTIONS).doc();
      tx.set(txRef, {
        purchaseId,
        parentId: p.parentId,
        teacherId: p.teacherId,
        bookingId,
        kind: 'consume',
        sessionsDelta: -1,
        balanceAfter: nextRemaining,
        createdAt: FieldValue.serverTimestamp(),
      });
      return nextRemaining;
    });
    return { ok: true, remaining };
  } catch (e: any) {
    const reason = String(e?.message || 'consume_failed');
    return { ok: false, reason };
  }
}

/**
 * คืนเครดิต 1 ครั้ง (เช่น ยกเลิกก่อน 24 ชม. ของ booking ที่จ่ายด้วยเครดิต)
 */
export async function refundPackageCredit(
  db: Firestore,
  purchaseId: string,
  bookingId: string | null,
): Promise<{ ok: boolean; remaining?: number }> {
  const ref = db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId);
  try {
    const remaining = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('purchase_not_found');
      const p = snap.data() as any;
      const left = Number(p.sessionsRemaining ?? 0);
      const next = left + 1;
      const used = Math.max(0, (Number(p.sessionsUsed) || 0) - 1);
      tx.update(ref, {
        sessionsUsed: used,
        sessionsRemaining: next,
        status: p.status === 'depleted' ? 'active' : p.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection(COLLECTIONS.CREDIT_TRANSACTIONS).doc(), {
        purchaseId,
        parentId: p.parentId,
        teacherId: p.teacherId,
        bookingId,
        kind: 'refund',
        sessionsDelta: 1,
        balanceAfter: next,
        createdAt: FieldValue.serverTimestamp(),
      });
      return next;
    });
    return { ok: true, remaining };
  } catch {
    return { ok: false };
  }
}

/**
 * ปล่อย escrow รายครั้งของแพ็กเกจ (เรียกตอน attendance=present)
 * - release net รายครั้ง (perSessionNet, ครั้งสุดท้ายเก็บเศษ) เข้า availableBalance ครู
 * - หักภาษี ณ ที่จ่าย 3% ต่อครั้ง (เกณฑ์ 1,000 บาท/ครั้ง เช่นเดียวกับ flow ปกติ)
 * - ลด pendingBalance ของครูที่เติมไว้ตอนซื้อแพ็กเกจ
 * - idempotent ด้วย booking.creditReleased
 */
export async function releasePackageSessionEscrow(
  db: Firestore,
  bookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) return { ok: false, reason: 'booking_not_found' };
  const booking = bookingSnap.data() as any;
  if (!booking.packagePurchaseId || !booking.paidWithCredit) return { ok: false, reason: 'not_credit_booking' };
  if (booking.creditReleased) return { ok: true, reason: 'already_released' };

  const purchaseRef = db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(booking.packagePurchaseId);
  const purchaseSnap = await purchaseRef.get();
  if (!purchaseSnap.exists) return { ok: false, reason: 'purchase_not_found' };
  const purchase = purchaseSnap.data() as any;

  const released = Number(purchase.releasedSessions) || 0;
  const total = Number(purchase.sessionsTotal) || 0;
  const netTotal = Number(purchase.netAmount) || 0;
  const releasedNetTotal = Number(purchase.releasedNetTotal) || 0;
  // ครั้งสุดท้าย = ยอดคงเหลือทั้งหมด (กันเศษทศนิยมสะสม)
  const isLast = released + 1 >= total;
  const sessionNet = isLast
    ? Math.round((netTotal - releasedNetTotal) * 100) / 100
    : Number(purchase.perSessionNet) || perSessionNetOf(netTotal, total);
  if (sessionNet <= 0) return { ok: false, reason: 'invalid_amount' };

  const belowThreshold = sessionNet < TAX_WITHHOLDING_THRESHOLD;
  const taxWithheld = belowThreshold ? 0 : Math.round(sessionNet * TAX_WITHHOLDING_RATE * 100) / 100;
  const payoutAmount = Math.round((sessionNet - taxWithheld) * 100) / 100;

  const wallet = await getOrCreateWallet(db, purchase.teacherId);
  await purchaseRef.update({
    releasedSessions: FieldValue.increment(1),
    releasedNetTotal: FieldValue.increment(sessionNet),
    taxWithheldTotal: FieldValue.increment(taxWithheld),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await wallet.ref.update({
    pendingBalance: FieldValue.increment(-sessionNet),
    availableBalance: FieldValue.increment(payoutAmount),
    totalEarned: FieldValue.increment(payoutAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await bookingRef.update({ creditReleased: true, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/** ยอด escrow ค้างของแพ็กเกจ (สำหรับ reconciliation กู้ยอดเมื่อซื้อแพ็กเกจ) */
export function packageTeacherFeeShare() {
  return { platformFeeRate: PLATFORM_FEE_RATE };
}

/**
 * ช่วงเวลาที่予約ได้ด้วย credite แพ็กเกจ (reuse availability logic เดียวกับการreservation ปกติ)
 * @param db Firestore instance
 * @param purchase package purchase record (ต้องมี courseId, teacherId)
 * @param fromDate YYYY-MM-DD
 * @param daysAhead จำนวนวันข้างหน้า
 */
export async function slotOptionsForPurchase(
  db: Firestore,
  purchase: any,
  fromDate: string,
  daysAhead = 60,
) {
  const schedulesSnap = await db.collection(COLLECTIONS.SCHEDULES)
    .where('courseId', '==', purchase.courseId)
    .get();
  const schedules = schedulesSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }) as AvailabilitySchedule)
    .filter((s: any) => s.isActive === true);
  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', purchase.teacherId)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(purchase.courseId).get();
  const duration = Number(courseSnap.data()?.durationMinutes) || 0;
  return buildAvailableBookingSlots({
    schedules,
    bookings: bookingsSnap.docs.map((d: any) => d.data() as AvailabilityBooking),
    courseDurationMinutes: duration,
    fromDate,
    daysAhead,
  });
}
