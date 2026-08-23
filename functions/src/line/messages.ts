import type { LineMessage } from './client';

export interface BookingMessageData {
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendeeCount?: number;
  maxStudents?: number;
  amount?: number;
  netAmount?: number;
}

export interface AttendanceMessageData {
  studentName: string;
  sessionDate: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending';
}

function money(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

function text(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function bookingCreatedMessage(data: BookingMessageData): LineMessage {
  const count = typeof data.attendeeCount === 'number'
    ? `${data.attendeeCount}${typeof data.maxStudents === 'number' ? `/${data.maxStudents}` : ''}`
    : '-';
  return {
    type: 'text',
    text: `📚 มีการจองเรียนใหม่แล้วค่ะ\n\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nคอร์ส: ${text(data.courseTitle, 'คอร์สเรียน')}\nวันเวลา: ${data.bookingDate} ${data.startTime}-${data.endTime} น.\nสถานที่: ${text(data.location, 'รอยืนยันสถานที่')}\nจำนวนผู้เรียน: ${count} คน\nผลตอบแทนคาดการณ์: ${money(data.netAmount)}\n\nเปิดดูรายละเอียดใน TutorPlatform ได้เลยนะคะ 🌈`,
  };
}

export function bookingStatusMessage(status: 'confirmed' | 'cancelled', data: BookingMessageData): LineMessage {
  const confirmed = status === 'confirmed';
  return {
    type: 'text',
    text: `${confirmed ? '✅' : '❌'} ${confirmed ? 'ยืนยัน' : 'ยกเลิก'}การจองเรียน\n\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nคอร์ส: ${text(data.courseTitle, 'คอร์สเรียน')}\nวันเวลา: ${data.bookingDate} ${data.startTime}-${data.endTime} น.\nสถานที่: ${text(data.location, 'ตามรายละเอียดในแอป')}\n\n${confirmed ? 'เจอกันในคลาสนะคะ 💖' : 'หากต้องการจองใหม่ สามารถกลับเข้าแอปได้เลยค่ะ'}`,
  };
}

export function paymentMessage(kind: 'pending' | 'paid', data: BookingMessageData): LineMessage {
  const paid = kind === 'paid';
  return {
    type: 'text',
    text: `${paid ? '💳✅ ชำระค่าเรียนสำเร็จ' : '💰 มีค่าเรียนรอชำระ'}\n\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nคอร์ส: ${text(data.courseTitle, 'คอร์สเรียน')}\nยอดเงิน: ${money(data.amount)}\n\n${paid ? 'การจองได้รับการยืนยันแล้วค่ะ' : 'กดเข้า TutorPlatform เพื่อดูรายละเอียดและชำระเงินนะคะ'}`,
  };
}

export function attendanceMessage(data: AttendanceMessageData): LineMessage {
  const statusText = {
    present: 'มาเรียน ✅',
    absent: 'ขาดเรียน ❌',
    late: 'มาสาย ⚠️',
    excused: 'ลา/ได้รับอนุญาต 📝',
    pending: 'รอเช็คชื่อ ⏳',
  }[data.status];
  return {
    type: 'text',
    text: `📋 แจ้งการเข้าเรียน\n\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nวันที่: ${data.sessionDate}\nสถานะ: ${statusText}`,
  };
}

export function paymentReleasedMessage(data: { courseTitle: string; studentName: string; amount: number }): LineMessage {
  return {
    type: 'text',
    text: `🎉 ปล่อยผลตอบแทนแล้วค่ะ\n\nคอร์ส: ${text(data.courseTitle, 'คอร์สเรียน')}\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nยอดสุทธิ: ${money(data.amount)}\n\nตรวจสอบรายละเอียดรายได้ใน TutorPlatform ได้เลยนะคะ 💖`,
  };
}

export function teacherPaymentPaidMessage(data: BookingMessageData): LineMessage {
  return {
    type: 'text',
    text: `💰 มีผลตอบแทนจากการจองเรียน\n\nนักเรียน: ${text(data.studentName, 'นักเรียน')}\nคอร์ส: ${text(data.courseTitle, 'คอร์สเรียน')}\nยอดสุทธิใน escrow: ${money(data.netAmount)}\nวันเรียน: ${data.bookingDate} ${data.startTime}-${data.endTime} น.\n\nตรวจสอบรายละเอียดได้ใน TutorPlatform นะคะ 🌟`,
  };
}
