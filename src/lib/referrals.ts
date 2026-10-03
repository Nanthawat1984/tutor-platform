// Referral (ชวนเพื่อน) — logic ฝั่ง server เท่านั้น
//
// โค้ดของผู้ใช้คือ `TF-` + 6 ตัวแรกของ uid (ตัวพิมพ์ใหญ่) → เดาไม่ง่าย และคำนวณได้
// โดยไม่ต้องอ่าน Firestore แต่ต้องระวังว่าเอกสาร referral ที่เขียนไว้เก็บโค้ด
// ไว้ในฟิลด์ `referrerCode` (ไม่ใช่ uid ของผู้ถูกแนะนำ) ดังนั้นการนับสถิติ
// ต้อง query ด้วย referrerCode ของเรา ไม่ใช่ uid

import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export const REFERRAL_CODE_PREFIX = 'TF-';
export const REFERRAL_CODE_LENGTH = 9; // 'TF-' + 6
export const REFERRAL_REWARD_AMOUNT = 100; // บาท ต่อผู้ถูกแนะนำที่คุณช่วยดึงเข้ามา
export const REFERRALS_MAX_PER_USER = 50; // กัน query บน collection ที่ไม่มีดัชนี

/** โค้ดของผู้ใช้ = ส่วนหนึ่งของ uid → ไม่ต้องอ่าน Firestore เพื่อแสดงโค้ด */
export function buildReferralCode(uid: string): string {
  const suffix = String(uid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
  return `${REFERRAL_CODE_PREFIX}${suffix}`;
}

/** ทำความสะอาด input จากผู้ใช้ก่อน validate (พิมพ์เล็ก/เว้นวรรค/ขีดเกิน) */
export function normalizeReferralCode(input: unknown): string {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 16);
}

export function isValidReferralCode(code: string): boolean {
  return /^TF-[A-Z0-9]{4,12}$/.test(code);
}

/** ซ่อนอีเมลก่อนส่งออกจากเซิร์ฟเวอร์ — ผู้ถูกแนะนำไม่ควรเห็นอีเมลเต็มของคนอื่น */
export function maskEmail(email: string): string {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : '';
  return `${head}${'*'.repeat(Math.max(2, name.length - 2))}${tail}@${domain}`;
}

export interface ReferralEntry {
  id: string;
  email: string;          // ถูก mask แล้ว
  status: 'pending' | 'rewarded';
  rewardAmount: number;
  createdAt: number | null; // epoch ms
}

export interface ReferralSummary {
  code: string;
  total: number;
  pending: number;
  rewarded: number;
  earnedAmount: number;   // บาท ที่ได้รับ/รอได้รับจริง
  entries: ReferralEntry[];
}

/**
 * สรุปสถิติ referral ของผู้ใช้
 * query ด้วย referrerCode (โค้ดของผู้เรียก) — ฟิลด์นี้คือฝั่ง "คนที่ถูกชวนของเรา"
 */
export async function getReferralSummary(db: Firestore, uid: string): Promise<ReferralSummary> {
  const code = buildReferralCode(uid);
  const snap = await db
    .collection('referrals')
    .where('referrerCode', '==', code)
    .limit(REFERRALS_MAX_PER_USER)
    .get();

  const entries: ReferralEntry[] = snap.docs.map((doc: any) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      email: maskEmail(String(data.referredEmail || '')),
      status: data.status === 'rewarded' ? 'rewarded' : 'pending',
      rewardAmount: Number(data.rewardAmount) || REFERRAL_REWARD_AMOUNT,
      createdAt: data.createdAt?.toMillis?.() ?? null,
    };
  });

  const rewarded = entries.filter((e) => e.status === 'rewarded').length;
  return {
    code,
    total: entries.length,
    pending: entries.length - rewarded,
    rewarded,
    earnedAmount: entries.reduce((sum, e) => sum + e.rewardAmount, 0),
    entries,
  };
}

export type ClaimReferralResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: 'invalid_code' | 'self_referral' | 'already_claimed' };

/**
 * ใช้โค้ดของเพื่อน — 1 คนใช้ได้ครั้งเดียว (คุมด้วย referredEmail/referredUid)
 */
export async function claimReferral(
  db: Firestore,
  input: { uid: string; email: string; code: string },
): Promise<ClaimReferralResult> {
  const code = normalizeReferralCode(input.code);
  if (!isValidReferralCode(code)) return { ok: false, reason: 'invalid_code' };
  if (code === buildReferralCode(input.uid)) return { ok: false, reason: 'self_referral' };

  const byEmail = await db.collection('referrals').where('referredEmail', '==', input.email).limit(1).get();
  if (!byEmail.empty) return { ok: false, reason: 'already_claimed' };

  const byUid = await db.collection('referrals').where('referredUid', '==', input.uid).limit(1).get();
  if (!byUid.empty) return { ok: false, reason: 'already_claimed' };

  const ref = await db.collection('referrals').add({
    referrerCode: code,
    referredEmail: input.email,
    referredUid: input.uid,
    status: 'pending',
    rewardAmount: REFERRAL_REWARD_AMOUNT,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id, code };
}