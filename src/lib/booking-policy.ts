// Booking policy — กติกาเลื่อน/ยกเลิก (self-service ไม่ผ่านแอดมิน)
// เวลาคิดเป็น Asia/Bangkok เสมอ หน่วยเป็นชั่วโมงก่อนเริ่มเซสชัน

export const FREE_RESCHEDULE_HOURS = 24;   // เลื่อนฟรีเมื่อแจ้งล่วงหน้า ≥ 24 ชม.
export const FREE_CANCEL_HOURS = 24;       // ยกเลิกคืนเต็มเมื่อแจ้งล่วงหน้า ≥ 24 ชม.
export const MAX_FREE_RESCHEDULES = 2;     // เลื่อนฟรีได้สูงสุด 2 ครั้ง/การจอง
export const LATE_CANCEL_REFUND_RATE = 0.5; // ยกเลิกสาย (<24 ชม.) คืน 50% อีกครึ่งชดเชยครู

function bangkokNow(): Date {
  return new Date();
}

export function sessionStartMillis(bookingDate: string, startTime: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate || '')) return null;
  if (!/^\d{2}:\d{2}/.test(startTime || '')) return null;
  const ms = new Date(`${bookingDate}T${(startTime || '').slice(0, 5)}:00+07:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function hoursUntilSession(bookingDate: string, startTime: string, nowMs?: number): number | null {
  const start = sessionStartMillis(bookingDate, startTime);
  if (start === null) return null;
  return (start - (nowMs ?? bangkokNow().getTime())) / 3_600_000;
}

export type RescheduleDecision =
  | { allowed: true; free: boolean; late: boolean; reason: 'free' | 'late_flagged' }
  | { allowed: false; reason: 'past_session' | 'too_many_reschedules' | 'invalid_status' | 'invalid_slot' };

export function decideReschedule(input: {
  status: string;
  bookingDate: string;
  startTime: string;
  rescheduleCount?: number;
  nowMs?: number;
}): RescheduleDecision {
  if (input.status !== 'confirmed' && input.status !== 'pending') {
    return { allowed: false, reason: 'invalid_status' };
  }
  const hours = hoursUntilSession(input.bookingDate, input.startTime, input.nowMs);
  if (hours === null) return { allowed: false, reason: 'invalid_slot' };
  if (hours <= 0) return { allowed: false, reason: 'past_session' };
  const count = Number(input.rescheduleCount) || 0;
  if (count >= MAX_FREE_RESCHEDULES && hours >= FREE_RESCHEDULE_HOURS) {
    return { allowed: false, reason: 'too_many_reschedules' };
  }
  if (hours >= FREE_RESCHEDULE_HOURS) return { allowed: true, free: true, late: false, reason: 'free' };
  // เลื่อนสาย (<24 ชม.): อนุญาต แต่ติดธงให้ครูเห็น + เปิด dispute ได้ — ไม่ต้องผ่านแอดมิน
  return { allowed: true, free: false, late: true, reason: 'late_flagged' };
}

export type CancelDecision =
  | { refund: 'full'; toWallet: true; teacherCompensation: 0 }
  | { refund: 'half'; toWallet: true; teacherCompensation: 0.5 }
  | { refund: 'none'; reason: 'past_session' | 'invalid_status' };

export function decideCancel(input: {
  status: string;
  bookingDate: string;
  startTime: string;
  nowMs?: number;
}): CancelDecision {
  if (input.status !== 'confirmed' && input.status !== 'pending') {
    return { refund: 'none', reason: 'invalid_status' };
  }
  // pending (ยังไม่จ่าย/รอตรวจสลิป): ยกเลิกฟรี ไม่มีเงินคืน (ใช้ flow เดิม)
  if (input.status === 'pending') return { refund: 'full', toWallet: false, teacherCompensation: 0 } as unknown as CancelDecision;
  const hours = hoursUntilSession(input.bookingDate, input.startTime, input.nowMs);
  if (hours === null || hours <= 0) return { refund: 'none', reason: 'past_session' };
  if (hours >= FREE_CANCEL_HOURS) return { refund: 'full', toWallet: true, teacherCompensation: 0 };
  return { refund: 'half', toWallet: true, teacherCompensation: 0.5 };
}

export const RESCHEDULE_ERROR_TH: Record<string, string> = {
  past_session: 'เซสชันนี้เริ่มไปแล้ว ไม่สามารถเลื่อนได้',
  too_many_reschedules: 'เลื่อนครบจำนวนครั้งที่กำหนดแล้ว กรุณาติดต่อครูโดยตรง',
  invalid_status: 'การจองนี้เลื่อนไม่ได้ (ถูกยกเลิกหรือจบแล้ว)',
  invalid_slot: 'วันเวลาที่เลือกไม่ถูกต้อง',
  booking_conflict: 'ช่วงเวลานี้ครูไม่ว่างแล้ว กรุณาเลือกเวลาอื่น',
  slot_unavailable: 'ช่วงเวลาที่เลือกไม่ตรงกับตารางครู',
};

export const CANCEL_ERROR_TH: Record<string, string> = {
  past_session: 'เซสชันนี้เริ่มไปแล้ว ไม่สามารถยกเลิกได้',
  invalid_status: 'การจองนี้ยกเลิกไม่ได้ (ถูกยกเลิกหรือจบแล้ว)',
};
