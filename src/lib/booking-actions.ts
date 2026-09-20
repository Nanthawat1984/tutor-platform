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

  let refunded = 0;

  if (booking.paidWithCredit && booking.packagePurchaseId) {
    // จองด้วยเครดิตแพ็กเกจ: ยกเลิกก่อน 24 ชม. คืนเครดิต, สายไม่คืน
    if (decision.refund === 'full') {
      await refundPackageCredit(db, booking.packagePurchaseId, booking.id);
      refunded = 1; // 1 เครดิต
    }
    await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update({
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    const payment = await getPaymentForBooking(db, booking.id);
    if (!payment || payment.status !== 'paid') {
      // จ่ายไม่สำเร็จแต่สถานะ confirmed หลุดมา — ยกเลิก booking อย่างเดียว
      await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (decision.refund === 'full') {
      const res = await refundPayment(db, payment.id);
      if (!res.ok) return { ok: false, error: 'refund_failed' };
      const amount = Math.round(Number(payment.amount) || 0);
      if (amount > 0) {
        await creditParentWallet(db, {
          parentId: booking.parentId,
          amount,
          kind: 'refund',
          bookingId: booking.id,
          paymentId: payment.id,
          note: decision.refund === 'full' ? 'คืนเต็ม — ยกเลิกล่วงหน้า ≥ 24 ชม.' : null,
        });
        refunded = amount;
        await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).update({
          refundDestination: 'parent_wallet_credit',
          refundAmount: amount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      // ยกเลิกสาย: คืนครึ่งเป็นเครดิต อีกครึ่งชดเชยครู (pending → available)
      const gross = Math.round(Number(payment.amount) || 0);
      const halfGross = Math.floor(gross / 2);
      const net = Number(payment.netAmount) || 0;
      const halfNet = Math.round((net / 2) * 100) / 100;
      await db.collection(COLLECTIONS.BOOKINGS).doc(booking.id).update({
        status: 'cancelled',
        lateCancel: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (halfGross > 0) {
        await creditParentWallet(db, {
          parentId: booking.parentId,
          amount: halfGross,
          kind: 'refund',
          bookingId: booking.id,
          paymentId: payment.id,
          note: 'คืน 50% — ยกเลิกล่วงหน้าน้อยกว่า 24 ชม.',
        });
        refunded = halfGross;
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
    }
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

export async function resolveBookingDispute(
  db: Firestore,
  input: { bookingId: string; note?: string },
): Promise<{ ok: boolean; error?: string }> {
  const snap = await db.collection(COLLECTIONS.BOOKINGS).doc(input.bookingId).get();
  if (!snap.exists) return { ok: false, error: 'not_found' };
  const booking = snap.data() as any;
  if (booking.dispute?.status !== 'open') return { ok: false, error: 'not_open' };

  await db.collection(COLLECTIONS.BOOKINGS).doc(input.bookingId).update({
    'dispute.status': 'resolved',
    'dispute.resolvedAt': FieldValue.serverTimestamp(),
    disputeOpen: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const uid of [booking.parentId, booking.teacherId].filter(Boolean)) {
    await notifyUser(db, {
      userId: uid,
      type: 'booking',
      title: 'ข้อพิพาทได้รับการแก้ไขแล้ว',
      body: `ข้อพิพาทของคลาส ${booking.studentName || 'นักเรียน'} วันที่ ${booking.bookingDate || '-'} ปิดแล้ว${input.note ? `: ${input.note.slice(0, 200)}` : ''}`,
      data: { bookingId: input.bookingId },
    });
  }
  return { ok: true };
}

export { FREE_RESCHEDULE_HOURS, MAX_FREE_RESCHEDULES, hoursUntilSession };
