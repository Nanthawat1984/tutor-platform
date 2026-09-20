// Parent wallet (เครดิตเงินบาทของผู้ปกครอง)
// รับเงินคืนจากการยกเลิก/เลื่อน (แทนการโอนคืนธนาคาร) แล้วนำไปใช้จองครั้งถัดไปได้
// ทุกการเคลื่อนไหวมี ledger ใน parentWalletTxs เสมอ

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';

export type ParentWalletTxKind = 'refund' | 'spend' | 'reversal' | 'adjust';

export async function getOrCreateParentWallet(db: Firestore, parentId: string) {
  const ref = db.collection(COLLECTIONS.PARENT_WALLETS).doc(parentId);
  const snap = await ref.get();
  if (snap.exists) return { ref, data: snap.data() as any };
  const initial = {
    parentId,
    balance: 0,
    totalCredited: 0,
    totalSpent: 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ ...initial, createdAt: FieldValue.serverTimestamp() });
  return { ref, data: { ...initial, balance: 0, totalCredited: 0, totalSpent: 0 } as any };
}

/**
 * เครดิตเงินเข้าวอลเล็ตผู้ปกครอง (เช่น เงินคืนจากยกเลิก) — transaction เดียว
 * บันทึก ledger + อัปยอดพร้อมกัน กันยอดหลุด
 */
export async function creditParentWallet(
  db: Firestore,
  input: {
    parentId: string;
    amount: number;
    kind?: ParentWalletTxKind;
    bookingId?: string | null;
    paymentId?: string | null;
    note?: string | null;
  },
): Promise<{ balanceAfter: number }> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_amount');
  const walletRef = db.collection(COLLECTIONS.PARENT_WALLETS).doc(input.parentId);
  const txRef = db.collection(COLLECTIONS.PARENT_WALLET_TXS).doc();

  const balanceAfter = await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const current = snap.exists
      ? (snap.data() as any)
      : { parentId: input.parentId, balance: 0, totalCredited: 0, totalSpent: 0 };
    const next = Math.round(((Number(current.balance) || 0) + amount) * 100) / 100;
    if (snap.exists) {
      tx.update(walletRef, {
        balance: next,
        totalCredited: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(walletRef, {
        parentId: input.parentId,
        balance: next,
        totalCredited: amount,
        totalSpent: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(txRef, {
      parentId: input.parentId,
      kind: input.kind || 'refund',
      amount,
      balanceAfter: next,
      bookingId: input.bookingId || null,
      paymentId: input.paymentId || null,
      note: input.note || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return next;
  });
  return { balanceAfter };
}

/**
 * ใช้เครดิตจากวอลเล็ต (เช่น จ่ายค่ายกเลิกสาย/หักค่าธรรมเนียม)
 * คืน insufficient=true แทน throw เพื่อให้ caller เลือก flow ต่อได้
 */
export async function debitParentWallet(
  db: Firestore,
  input: {
    parentId: string;
    amount: number;
    kind?: ParentWalletTxKind;
    bookingId?: string | null;
    paymentId?: string | null;
    note?: string | null;
    allowNegative?: boolean;
  },
): Promise<{ ok: boolean; balanceAfter: number; reason?: string }> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, balanceAfter: 0, reason: 'invalid_amount' };
  const walletRef = db.collection(COLLECTIONS.PARENT_WALLETS).doc(input.parentId);
  const txRef = db.collection(COLLECTIONS.PARENT_WALLET_TXS).doc();

  try {
    const balanceAfter = await db.runTransaction(async (tx) => {
      const snap = await tx.get(walletRef);
      if (!snap.exists) throw new Error('insufficient_credit');
      const current = snap.data() as any;
      const balance = Number(current.balance) || 0;
      if (!input.allowNegative && balance < amount) throw new Error('insufficient_credit');
      const next = Math.round((balance - amount) * 100) / 100;
      tx.update(walletRef, {
        balance: next,
        totalSpent: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(txRef, {
        parentId: input.parentId,
        kind: input.kind || 'spend',
        amount: -amount,
        balanceAfter: next,
        bookingId: input.bookingId || null,
        paymentId: input.paymentId || null,
        note: input.note || null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return next;
    });
    return { ok: true, balanceAfter };
  } catch (e: any) {
    if (e?.message === 'insufficient_credit') {
      const snap = await walletRef.get();
      return { ok: false, balanceAfter: Number(snap.data()?.balance) || 0, reason: 'insufficient_credit' };
    }
    throw e;
  }
}
