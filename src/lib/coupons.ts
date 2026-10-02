// Coupons — ออก/ตรวจ/ใช้คูปอง (server-side เท่านั้น)
// - คูปองทั่วไป: แอดมินสร้างใน coupons collection
// - คูปองลูกค้าใหม่ (first_booking): ผูก ownerUid + ใช้ได้เฉพาะคนที่ไม่เคยจ่ายสำเร็จ

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

export const FIRST_BOOKING_DISCOUNT = 100; // บาท
export const FIRST_BOOKING_MIN_AMOUNT = 500;
export const FIRST_BOOKING_VALID_DAYS = 90;

export interface CouponDoc {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  maxDiscount?: number;
  minAmount?: number;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: unknown;
  scope?: 'general' | 'first_booking';
  ownerUid?: string | null;
}

export function computeCouponDiscount(coupon: CouponDoc, amount: number): number {
  let discount = 0;
  if (coupon.kind === 'percent') {
    discount = Math.floor((amount * (Number(coupon.value) || 0)) / 100);
    if (typeof coupon.maxDiscount === 'number') discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = Number(coupon.value) || 0;
  }
  return Math.max(0, Math.min(discount, amount));
}

function couponExpired(coupon: CouponDoc): boolean {
  const ms = (coupon.expiresAt as any)?.toMillis?.() || 0;
  return Boolean(ms) && ms < Date.now();
}

export async function isFirstTimeBuyer(db: Firestore, parentId: string): Promise<boolean> {
  // เคยจ่ายสำเร็จ (session หรือ package) = ไม่ใช่ลูกค้าใหม่
  const snap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('parentId', '==', parentId)
    .where('status', '==', 'paid')
    .limit(1)
    .get();
  return snap.empty;
}

/**
 * ออกคูปองลูกค้าใหม่ให้ผู้ปกครอง (idempotent ต่อ uid — มีแล้วคืนใบเดิม)
 */
export async function ensureFirstBookingCoupon(
  db: Firestore,
  parentId: string,
): Promise<{ code: string; created: boolean } | null> {
  const existing = await db.collection('coupons')
    .where('scope', '==', 'first_booking')
    .where('ownerUid', '==', parentId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { code: String(existing.docs[0].data()?.code || ''), created: false };
  }
  if (!(await isFirstTimeBuyer(db, parentId))) return null;
  const code = `NEW-${parentId.slice(0, 6).toUpperCase()}`;
  // กันชนกับโค้ดคนอื่น (uid 6 ตัวแรกซ้ำกันยาก แต่กันไว้)
  const clash = await db.collection('coupons').where('code', '==', code).limit(1).get();
  const finalCode = clash.empty ? code : `NEW-${parentId.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`;
  await db.collection('coupons').add({
    code: finalCode,
    kind: 'fixed',
    value: FIRST_BOOKING_DISCOUNT,
    minAmount: FIRST_BOOKING_MIN_AMOUNT,
    usageLimit: 1,
    usedCount: 0,
    isActive: true,
    scope: 'first_booking',
    ownerUid: parentId,
    expiresAt: Timestamp.fromMillis(Date.now() + FIRST_BOOKING_VALID_DAYS * 24 * 3600 * 1000),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { code: finalCode, created: true };
}

// ────────────────────────────────────────────
// จัดการคูปองฝั่งแอดมิน
// ────────────────────────────────────────────
export interface CreateCouponInput {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  maxDiscount?: number | null;
  minAmount?: number | null;
  usageLimit?: number | null;
  validDays?: number | null;      // null/0 = ไม่มีวันหมดอายุ
}

export function normalizeCouponCode(code: string): string {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

/**
 * สร้างคูปองทั่วไป (admin) — โค้ดต้องไม่ซ้ำ
 * ปิดท้ายด้วยเงื่อนไขการใช้งานชุดเดียวกับ validateCoupon เพื่อให้ admin ไม่ต้องเดา
 */
export async function createCoupon(
  db: Firestore,
  input: CreateCouponInput,
): Promise<{ id: string; code: string }> {
  const code = normalizeCouponCode(input.code);
  if (code.length < 3) throw new Error('invalid_code');
  if (input.kind !== 'percent' && input.kind !== 'fixed') throw new Error('invalid_kind');
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error('invalid_value');
  if (input.kind === 'percent' && value > 100) throw new Error('invalid_percent');

  const clash = await db.collection('coupons').where('code', '==', code).limit(1).get();
  if (!clash.empty) throw new Error('code_taken');

  const validDays = Number(input.validDays) || 0;
  const ref = await db.collection('coupons').add({
    code,
    kind: input.kind,
    value,
    maxDiscount: Number(input.maxDiscount) > 0 ? Number(input.maxDiscount) : null,
    minAmount: Number(input.minAmount) > 0 ? Number(input.minAmount) : null,
    usageLimit: Number(input.usageLimit) > 0 ? Number(input.usageLimit) : null,
    usedCount: 0,
    isActive: true,
    scope: 'general',
    ownerUid: null,
    expiresAt: validDays > 0
      ? Timestamp.fromMillis(Date.now() + validDays * 24 * 3600 * 1000)
      : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, code };
}

/** เปิด/ปิดคูปอง — ปิดแล้วใช้ไม่ได้ทันที (validateCoupon เช็ค isActive) */
export async function setCouponActive(
  db: Firestore,
  couponId: string,
  isActive: boolean,
): Promise<{ ok: boolean }> {
  await db.collection('coupons').doc(couponId).update({
    isActive,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

export type CouponCheck =
  | { ok: true; coupon: CouponDoc; discount: number }
  | { ok: false; reason: string; minAmount?: number };

/**
 * ตรวจคูปองแบบ read-only (ไม่ consume) — ใช้กับฟอร์มก่อนกดยืนยัน
 */
export async function validateCoupon(
  db: Firestore,
  code: string,
  amount: number,
  parentId: string,
): Promise<CouponCheck> {
  const normalized = String(code || '').trim().toUpperCase().slice(0, 32);
  if (!normalized) return { ok: false, reason: 'missing_code' };
  const snap = await db.collection('coupons').where('code', '==', normalized).limit(1).get();
  if (snap.empty) return { ok: false, reason: 'not_found' };
  const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as CouponDoc;
  if (coupon.isActive !== true) return { ok: false, reason: 'inactive' };
  if (couponExpired(coupon)) return { ok: false, reason: 'expired' };
  if (typeof coupon.usageLimit === 'number' && (coupon.usedCount || 0) >= coupon.usageLimit) {
    return { ok: false, reason: 'exhausted' };
  }
  if (typeof coupon.minAmount === 'number' && amount < coupon.minAmount) {
    return { ok: false, reason: 'min_amount', minAmount: coupon.minAmount };
  }
  if (coupon.scope === 'first_booking') {
    if (coupon.ownerUid && coupon.ownerUid !== parentId) return { ok: false, reason: 'not_owner' };
    if (!coupon.ownerUid && !(await isFirstTimeBuyer(db, parentId))) {
      return { ok: false, reason: 'not_first_booking' };
    }
    if (coupon.ownerUid && !(await isFirstTimeBuyer(db, parentId))) {
      return { ok: false, reason: 'not_first_booking' };
    }
  }
  return { ok: true, coupon, discount: computeCouponDiscount(coupon, amount) };
}
