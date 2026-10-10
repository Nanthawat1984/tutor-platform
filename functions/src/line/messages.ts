import type { LineMessage } from './client';
import {
  createAttendanceFlexMessage,
  createBookingFlexMessage,
  createPaymentFlexMessage,
  createSessionReportFlexMessage,
  createQuickClassReminderFlexMessage,
  type AttendanceFlexData,
  type BookingFlexData,
  type PaymentFlexData,
  type SessionReportFlexData,
} from './flex-messages';

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
  courseTitle?: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending';
  note?: string;
}

export interface SessionReportMessageData {
  studentName: string;
  courseTitle: string;
  sessionDate: string;
  summary?: string;
  strengths?: string;
  improvements?: string;
  homework?: string;
}

export function bookingCreatedMessage(data: BookingMessageData): LineMessage {
  return createBookingFlexMessage(
    '📚 มีการจองเรียนใหม่',
    'รอการสอน',
    '#4F46E5',
    {
      studentName: data.studentName,
      courseTitle: data.courseTitle,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      amount: data.amount,
      netAmount: data.netAmount,
    },
    'teacher'
  );
}

export function bookingStatusMessage(
  status: 'confirmed' | 'cancelled',
  data: BookingMessageData,
  role: 'parent' | 'teacher' = 'parent'
): LineMessage {
  const confirmed = status === 'confirmed';
  return createBookingFlexMessage(
    confirmed ? '✅ ยืนยันการจองเรียนแล้ว' : '❌ ยกเลิกการจองเรียน',
    confirmed ? 'ยืนยันแล้ว' : 'ยกเลิกแล้ว',
    confirmed ? '#059669' : '#DC2626',
    {
      studentName: data.studentName,
      courseTitle: data.courseTitle,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      amount: data.amount,
      netAmount: data.netAmount,
    },
    role
  );
}

export function paymentMessage(kind: 'pending' | 'paid', data: BookingMessageData): LineMessage {
  return createPaymentFlexMessage({
    studentName: data.studentName,
    courseTitle: data.courseTitle,
    amount: data.amount || 0,
    status: kind,
  });
}

export function attendanceMessage(data: AttendanceMessageData): LineMessage {
  return createAttendanceFlexMessage({
    studentName: data.studentName,
    sessionDate: data.sessionDate,
    courseTitle: data.courseTitle,
    status: data.status,
    note: data.note,
  });
}

export function sessionReportMessage(data: SessionReportMessageData): LineMessage {
  return createSessionReportFlexMessage({
    studentName: data.studentName,
    courseTitle: data.courseTitle,
    sessionDate: data.sessionDate,
    summary: data.summary,
    strengths: data.strengths,
    improvements: data.improvements,
    homework: data.homework,
  });
}

export function classReminderMessage(data: {
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingLink?: string;
  minutesRemaining?: number;
  role?: 'parent' | 'teacher';
}): LineMessage {
  return createQuickClassReminderFlexMessage(data);
}

export function paymentReleasedMessage(data: { courseTitle: string; studentName: string; amount: number }): LineMessage {
  const amountFormatted = `${data.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
  return {
    type: 'flex',
    altText: `🎉 ปล่อยผลตอบแทนแล้ว: ${data.courseTitle} (${amountFormatted})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#10B981',
        paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: '🎉 ปล่อยผลตอบแทนสำเร็จ',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            flex: 1,
          },
          {
            type: 'text',
            text: 'เข้าวอลเล็ตแล้ว',
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'end',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: data.courseTitle, weight: 'bold', size: 'md', color: '#1E293B' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'นักเรียน:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.studentName, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            alignItems: 'center',
            contents: [
              { type: 'text', text: 'ยอดสุทธิ:', size: 'md', color: '#64748B', width: '80px' },
              { type: 'text', text: amountFormatted, size: 'xl', color: '#059669', weight: 'bold', flex: 1 },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#10B981',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ดูยอดเงินในวอลเล็ต',
              uri: 'https://liff.line.me/2007886477-X9o0Nqk2/earnings',
            },
          },
        ],
      },
    },
  };
}

export function teacherPaymentPaidMessage(data: BookingMessageData): LineMessage {
  const netText = typeof data.netAmount === 'number'
    ? `${data.netAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
    : '- บาท';

  return {
    type: 'flex',
    altText: `💰 มีผลตอบแทนจากการจองเรียน: ${data.courseTitle}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#3B82F6',
        paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: '💰 มีผลตอบแทนเข้า Escrow',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            flex: 1,
          },
          {
            type: 'text',
            text: 'ชำระแล้ว',
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'end',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: data.courseTitle, weight: 'bold', size: 'md', color: '#1E293B' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'นักเรียน:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.studentName, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'วันเวลา:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: `${data.bookingDate} ${data.startTime}-${data.endTime} น.`, size: 'sm', color: '#1E293B', flex: 1 },
            ],
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            alignItems: 'center',
            contents: [
              { type: 'text', text: 'ยอดใน Escrow:', size: 'sm', color: '#64748B', width: '100px' },
              { type: 'text', text: netText, size: 'lg', color: '#2563EB', weight: 'bold', flex: 1 },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ดูรายละเอียดการสอน',
              uri: 'https://liff.line.me/2007886477-X9o0Nqk2/schedule',
            },
          },
        ],
      },
    },
  };
}
