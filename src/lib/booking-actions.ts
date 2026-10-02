// Booking self-service core — ใช้ร่วมกันระหว่าง API routes และ server actions
// กติกาเวลาจาก @/lib/booking-policy, เครดิตแพ็กเกจจาก @/lib/packages

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import {
  decideReschedule,
  decideCancel,
  hoursUntilSession,
  FREE_RESCHEDULE_HOURS,
  MAX_FREE_RESCHEDULES,
} from '@/lib/booking-policy';
import {
  validateBookingSlot,
  type AvailabilityBooking,
  type AvailabilitySchedule,
} from '@/lib/booking/availability';
import { getPaymentForBooking, refundPayment } from '@/lib/payments/process';
import { refundPackageCredit } from '@/lib/packages';
import { creditParentWallet } from '@/lib/parent-wallet';
import { notifyUser } from '@/lib/line-outbox';

export interface SlotInput {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
}

async function assertBookingParty(db: Firestore, bookingId: string, uid: string) {
  const snap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) return { error: 'not_found' as const };
  const booking = { id: snap.id, ...snap.data() } as any;
  if (booking.parentId !== uid && booking.teacherId !== uid) return { error: 'forbidden' as const };
  return { booking };
}

export async function rescheduleBooking(
  db: Firestore,
  input: { bookingId: string; uid: string; slot: SlotInput; actorRole: 'parent' | 'teacher' },
): Promise<{ ok: boolean; error?: string }> {
  const checked = await assertBookingParty(db, input.bookingId, input.uid);
  if ('error' in checked) return { ok: false, error: checked.error };
  const booking = checked.booking;

  const decision = decideReschedule({
    status: booking.status,
    bookingDate: booking.bookingDate,
    startTime: booking.startTime,
    rescheduleCount: booking.rescheduleCount,
  });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  const scheduleSnap = await db.collection(COLLECTIONS.SCHEDULES).doc(input.slot.scheduleId).get();
  const schedule = scheduleSnap.exists
    ? ({ id: scheduleSnap.id, ...scheduleSnap.data() } as AvailabilitySchedule)
    : null;
  if (!schedule || schedule.courseId !== booking.courseId) {
    return { ok: false, error: 'slot_unavailable' };
  }
  const courseSnap = await db.collection(COLLECTIONS.COURSES).doc(booking.courseId).get();
  const course = courseSnap.exists ? courseSnap.data() as any : null;
  if (!course || course.isActive !== true) return { ok: false, error: 'slot_unavailable' };

  const conflictsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', booking.teacherId)
    .where('bookingDate', '==', input.slot.date)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  const others = conflictsSnap.docs
    .map((d: any) => d.data() as AvailabilityBooking)
    .filter((b) => true);
  // ตัด booking ตัวเองออกจากการเช็คชน (กรณีเลื่อนวันเดิมเวลาซ้อนตัวเอง)
  const othersExcludingSelf = conflictsSnap.docs
    .filter((d: any) => d.id !== booking.id)
    .map((d: any) => d.data() as AvailabilityBooking);

  const validation = validateBookingSlot({
    schedule,
    bookingDate: input.slot.date,
    startTime: input.slot.startTime,
    endTime: input.slot.endTime,
    courseDurationMinutes: Number(course.durationMinutes) || 0,
    bookings: othersExcludingSelf,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.reason === 'booking_conflict' ? 'booking_conflict' : 'slot_unavailable' };
  }
  void others;

  const newCount = (Number(booking.rescheduleCount) || 0) + 1;
  await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update({
    bookingDate: validation.slot.date,
    startTime: validation.slot.startTime,
    endTime: validation.slot.endTime,
    rescheduleCount: newCount,
    lateReschedule: decision.late === true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const slotLabel = `${validation.slot.date} ${validation.slot.startTime}-${validation.slot.endTime} น.`;
  const lateNote = decision.late ? ' (แจ้งล่วงหน้าน้อยกว่า 24 ชม. — ครูจะเห็นธงนี้)' : '';
  const otherUid = input.actorRole === 'parent' ? booking.teacherId : booking.parentId;
  const actorLabel = input.actorRole === 'parent' ? 'ผู้ปกครอง' : 'ครู';
  await notifyUser(db, {
    userId: otherUid,
    type: 'booking',
    title: 'มีการเลื่อนเวลาเรียน',
    body: `${actorLabel}ขอเลื่อนคลาสของ ${booking.studentName || 'นักเรียน'} เป็น ${slotLabel}${lateNote}`,
    data: { bookingId: booking.id },
    lineEventType: 'booking.rescheduled',
    lineEntityId: booking.id,
    lineMessages: [{
      type: 'text',
      text: `🔄 มีการเลื่อนเวลาเรียน\n\nนักเรียน: ${booking.studentName || 'นักเรียน'}\nคอร์ส: ${booking.courseTitle || 'คอร์สเรียน'}\nเวลาใหม่: ${slotLabel}${lateNote}`,
    }],
  });
  // แจ้งคนทำรายการด้วย (กันลืม)
  await notifyUser(db, {
    userId: input.uid,
    type: 'booking',
    title: 'เลื่อนเวลาเรียนสำเร็จ',
    body: `คลาสของ ${booking.studentName || 'นักเรียน'} ถูกเลื่อนเป็น ${slotLabel} แล้ว`,
    data: { bookingId: booking.id },
  });
  return { ok: true };
}

type RefundBranch = 'package' | 'unpaid' | 'full' | 'half';

/**
 * คืนเงิน/เครดิตตามอัตราที่เลือก — logic ทางเงินของทั้ง "ยกเลิกคลาส" (กติกานโยบาย)
 * และ "แอดมินตัดสินข้อพิพาท" (ผู้ดูแลเลือกผล)
 *
 * ไม่เขียนสถานะ booking (ผู้เรียกเป็นคนจัดการเอง) และไม่แตะสถานะ payment
 * (refundPayment จัดการเอง) — คืนผลลัพธ์ให้ผู้เรียกตัดสินใจต่อ
 */
async function refundBookingMoney(
  db: Firestore,
  booking: any,
  rate: 'full' | 'half',
  notes: { full?: string | null; half?: string | null } = {},
): Promise<{ ok: boolean; refunded: number; branch: RefundBranch; error?: string }> {
  // จองด้วยเครดิตแพ็กเกจ: คืนได้เป็นรายครั้งเต็มเท่านั้น
  if (booking.paidWithCredit && booking.packagePurchaseId) {
    if (rate === 'full') {
      await refundPackageCredit(db, booking.packagePurchaseId, booking.id);
      return { ok: true, refunded: 1, branch: 'package' };
    }
    return { ok: true, refunded: 0, branch: 'package' };
  }

  const payment = await getPaymentForBooking(db, booking.id);
  if (!payment || payment.status !== 'paid') {
    // ยังไม่มีเงินจริง (จ่ายไม่สำเร็จแต่สถานะ confirmed หลุดมา) — ไม่มีอะไรให้คืน
    return { ok: true, refunded: 0, branch: 'unpaid' };
  }

  if (rate === 'full') {
    const res = await refundPayment(db, payment.id);
    if (!res.ok) return { ok: false, refunded: 0, branch: 'full', error: 'refund_failed' };
    const amount = Math.round(Number(payment.amount) || 0);
    if (amount <= 0) return { ok: true, refunded: 0, branch: 'full' };
    await creditParentWallet(db, {
      parentId: booking.parentId,
      amount,
      kind: 'refund',
      bookingId: booking.id,
      paymentId: payment.id,
      note: notes.full ?? null,
    });
    await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
      refundDestination: 'parent_wallet_credit',
      refundAmount: amount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, refunded: amount, branch: 'full' };
  }

  // คืนครึ่งเป็นเครดิต อีกครึ่งชดเชยครู (pending → available)
  const gross = Math.round(Number(payment.amount) || 0);
  const halfGross = Math.floor(gross / 2);
  const net = Number(payment.netAmount) || 0;
  const halfNet = Math.round((net / 2) * 100) / 100;
  if (halfGross > 0) {
    await creditParentWallet(db, {
      parentId: booking.parentId,
      amount: halfGross,
      kind: 'refund',
      bookingId: booking.id,
      paymentId: payment.id,
      note: notes.half ?? null,
    });
  }
  if (halfNet > 0 && payment.teacherId) {
    const { getOrCreateWallet } = await import('@/lib/payments/process');
    const wallet = await getOrCreateWallet(db, payment.teacherId);
    await wallet.ref.update({
      pendingBalance: FieldValue.increment(-net),
      availableBalance: FieldValue.increment(halfNet),
      totalEarned: FieldValue.increment(halfNet),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
    refundDestination: 'parent_wallet_credit',
    refundAmount: halfGross,
    partialRefund: true,
    teacherCompensation: Math.round((net - halfNet) * 100) / 100,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, refunded: halfGross, branch: 'half' };
}

export async function cancelBooking(
  db: Firestore,
  input: { bookingId: string; uid: string; actorRole: 'parent' | 'teacher'; reason?: string },
): Promise<{ ok: boolean; error?: string; refunded?: number }> {
  const checked = await assertBookingParty(db, input.bookingId, input.uid);
  if ('error' in checked) return { ok: false, error: checked.error };
  const booking = checked.booking;

  // pending (ยังไม่จบการจ่าย) → flow เดิม: ยกเลิก booking + ทิ้ง payment ที่ค้าง
  if (booking.status === 'pending') {
    const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
      .where('bookingId', '==', booking.id)
      .get();
    const batch = db.batch();
    batch.update(db.collection(COLLECTIONS.BOOKINGS).doc(booking.id), {
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    });
    paymentsSnap.docs.forEach((d: any) => {
      if (d.data()?.status === 'pending' || d.data()?.status === 'awaiting_review') {
        batch.update(d.ref, { status: 'cancelled', note: 'booking_cancelled', updatedAt: FieldValue.serverTimestamp() });
      }
    });
    await batch.commit();
    return { ok: true, refunded: 0 };
  }

  const decision = decideCancel({
    status: booking.status,
    bookingDate: booking.bookingDate,
    startTime: booking.startTime,
  });
  if (decision.refund === 'none') return { ok: false, error: decision.reason };

  // ทางเงิน: กติกานโยบายเป็นตัวกำหนดอัตรา (เต็ม ≥24 ชม., ครึ่งเมื่อสาย)
  const money = await refundBookingMoney(
    db,
    booking,
    decision.refund === 'full' ? 'full' : 'half',
    {
      full: 'คืนเต็ม — ยกเลิกล่วงหน้า ≥ 24 ชม.',
      half: 'คืน 50% — ยกเลิกล่วงหน้าน้อยกว่า 24 ชม.',
    },
  );
  if (!money.ok) return { ok: false, error: money.error };
  const refunded = money.refunded;

  // สถานะ booking — สาขา 'full' ถูก refundPayment ตั้งเป็น cancelled ให้แล้ว
  if (money.branch !== 'full') {
    const bookingUpdate: Record<string, unknown> = {
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (money.branch === 'half') bookingUpdate.lateCancel = true;
    await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update(bookingUpdate);
  }

  const otherUid = input.actorRole === 'parent' ? booking.teacherId : booking.parentId;
  const actorLabel = input.actorRole === 'parent' ? 'ผู้ปกครอง' : 'ครู';
  const refundText = refunded > 0
    ? (booking.paidWithCredit ? ' (คืนเครดิต 1 ครั้งแล้ว)' : ` (คืนเครดิต ${refunded.toLocaleString('th-TH')} บาทแล้ว)`)
    : '';
  const reasonText = input.reason ? ` เหตุผล: ${input.reason.slice(0, 200)}` : '';
  await notifyUser(db, {
    userId: otherUid,
    type: 'booking',
    title: 'มีการยกเลิกคลาสเรียน',
    body: `${actorLabel}ยกเลิกคลาสของ ${booking.studentName || 'นักเรียน'} วันที่ ${booking.bookingDate || '-'}${refundText}.${reasonText}`,
    data: { bookingId: booking.id },
    lineEventType: 'booking.cancelled',
    lineEntityId: booking.id,
    lineMessages: [{
      type: 'text',
      text: `❌ ยกเลิกการจองเรียน\n\nนักเรียน: ${booking.studentName || 'นักเรียน'}\nคอร์ส: ${booking.courseTitle || 'คอร์สเรียน'}\nวันที่เดิม: ${booking.bookingDate || '-'} ${booking.startTime || ''}-${booking.endTime || ''} น.${refundText}`,
    }],
  });

  return { ok: true, refunded };
}

export async function fileBookingDispute(
  db: Firestore,
  input: { bookingId: string; uid: string; actorRole: 'parent' | 'teacher'; reason: string; note?: string },
): Promise<{ ok: boolean; error?: string }> {
  const checked = await assertBookingParty(db, input.bookingId, input.uid);
  if ('error' in checked) return { ok: false, error: checked.error };
  const booking = checked.booking;
  const reason = String(input.reason || '').trim().slice(0, 200);
  if (!reason) return { ok: false, error: 'reason_required' };
  if (booking.dispute?.status === 'open') return { ok: false, error: 'already_open' };

  await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update({
    dispute: {
      status: 'open',
      reason,
      note: String(input.note || '').slice(0, 500) || null,
      filedBy: input.actorRole,
      createdAt: FieldValue.serverTimestamp(),
      resolvedAt: null,
    },
    disputeOpen: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const otherUid = input.actorRole === 'parent' ? booking.teacherId : booking.parentId;
  await notifyUser(db, {
    userId: otherUid,
    type: 'booking',
    title: 'มีข้อพิพาทใหม่',
    body: `คลาสของ ${booking.studentName || 'นักเรียน'} วันที่ ${booking.bookingDate || '-'} ถูกเปิดข้อพิพาท: ${reason} — แอดมินจะตรวจสอบ`,
    data: { bookingId: booking.id },
  });
  return { ok: true };
}

export type DisputeOutcome = 'no_refund' | 'refund_full' | 'refund_half';

const DISPUTE_OUTCOMES: DisputeOutcome[] = ['no_refund', 'refund_full', 'refund_half'];

/**
 * ปิดข้อพิพาท + เลือกผลทางการเงิน (แอดมิน)
 *
 * การคืนเงินของข้อพิพาทคิดจาก `payment.amount` ซึ่งคือ “ยอดเงินสดที่ผู้ปกครองจ่ายจริง”
 * (หักส่วนที่ใช้เครดิตวอลเล็ตไปแล้ว) และคืนเป็นเครดิตวอลเล็ตเท่านั้น
 * — ไม่แตะ escrow/ยอดของครู เพราะเซสชันจบไปแล้วและเงินถูกปล่อยให้ครูแล้ว
 * (ส่วนเครดิตแพ็กเกจคืนได้เฉพาะเต็ม 1 ครั้ง คืนครึ่งไม่ได้)
 */
export async function resolveBookingDispute(
  db: Firestore,
  input: { bookingId: string; note?: string; outcome?: DisputeOutcome; adminId?: string },
): Promise<{ ok: boolean; error?: string; refunded?: number }> {
  const outcome = input.outcome && DISPUTE_OUTCOMES.includes(input.outcome) ? input.outcome : 'no_refund';
  const snap = await db.collection(COLLECTIONS.BOOKINGS).doc(input.bookingId).get();
  if (!snap.exists) return { ok: false, error: 'not_found' };
  // ต้องแนบ id ด้วย — ส่วนคืนเงินใช้ booking.id ใน query
  const booking = { id: snap.id, ...snap.data() } as any;
  if (booking.dispute?.status !== 'open') return { ok: false, error: 'not_open' };

  let refunded = 0;
  let refundedKind: 'wallet' | 'package_credit' | null = null;

  if (outcome !== 'no_refund') {
    if (booking.paidWithCredit && booking.packagePurchaseId) {
      if (outcome === 'refund_full') {
        await refundPackageCredit(db, booking.packagePurchaseId, booking.id);
        refunded = 1;
        refundedKind = 'package_credit';
      }
    } else {
      const payment = await getPaymentForBooking(db, booking.id);
      // คืนไปแล้ว (เช่น ยกเลิกก่อนแล้วค่อยมาเปิดข้อพิพาท) — ไม่คืนซ้ำ
      if (payment && (payment.disputeRefund || payment.refundDestination)) {
        return { ok: false, error: 'already_refunded' };
      }
      if (payment && payment.status === 'paid' && booking.parentId) {
        const gross = Math.round(Number(payment.amount) || 0);
        const amount = outcome === 'refund_full' ? gross : Math.floor(gross / 2);
        if (amount > 0) {
          await creditParentWallet(db, {
            parentId: booking.parentId,
            amount,
            kind: 'refund',
            bookingId: booking.id,
            paymentId: payment.id,
            note: outcome === 'refund_full'
              ? 'คืนเต็ม — ตัดสินข้อพิพาท'
              : 'คืน 50% — ตัดสินข้อพิพาท',
          });
          refunded = amount;
          refundedKind = 'wallet';
          await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
            refundDestination: 'parent_wallet_credit',
            refundAmount: amount,
            ...(outcome === 'refund_half' ? { partialRefund: true } : {}),
            disputeRefund: {
              outcome,
              amount,
              by: input.adminId || null,
              at: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
  }

  await db.collection(COLLECTIONS.BOOKINGS).doc(input.bookingId).update({
    'dispute.status': 'resolved',
    'dispute.resolvedAt': FieldValue.serverTimestamp(),
    'dispute.outcome': outcome,
    'dispute.refundedAmount': refunded,
    'dispute.refundedKind': refundedKind,
    'dispute.resolvedBy': input.adminId || null,
    disputeOpen: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const outcomeText = outcome === 'refund_full'
    ? refundedKind === 'package_credit'
      ? ' ผลตัดสิน: คืนเครดิตแพ็กเกจ 1 ครั้ง'
      : refunded > 0
        ? ` ผลตัดสิน: คืนเครดิตเต็ม ${refunded.toLocaleString('th-TH')} บาท`
        : ' ผลตัดสิน: คืนเครดิตเต็ม (ไม่มียอดเงินสดให้คืน)'
    : outcome === 'refund_half'
      ? refunded > 0
        ? ` ผลตัดสิน: คืนเครดิต 50% (${refunded.toLocaleString('th-TH')} บาท)`
        : ' ผลตัดสิน: คืนเครดิต 50% (ไม่มียอดเงินสดให้คืน)'
      : ' ผลตัดสิน: ไม่คืนเงิน';

  for (const uid of [booking.parentId, booking.teacherId].filter(Boolean)) {
    await notifyUser(db, {
      userId: uid,
      type: 'booking',
      title: 'ข้อพิพาทได้รับการแก้ไขแล้ว',
      body: `ข้อพิพาทของคลาส ${booking.studentName || 'นักเรียน'} วันที่ ${booking.bookingDate || '-'} ปิดแล้ว${outcomeText}${input.note ? `: ${input.note.slice(0, 200)}` : ''}`,
      data: { bookingId: input.bookingId },
    });
  }
  return { ok: true, refunded };
}

export { FREE_RESCHEDULE_HOURS, MAX_FREE_RESCHEDULES, hoursUntilSession };
