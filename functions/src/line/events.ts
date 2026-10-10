import type { Firestore } from 'firebase-admin/firestore';
import { createLineOutbox } from './outbox';
import {
  attendanceMessage,
  bookingCreatedMessage,
  bookingStatusMessage,
  paymentMessage,
  paymentReleasedMessage,
  sessionReportMessage,
  teacherPaymentPaidMessage,
  classReminderMessage,
  type BookingMessageData,
} from './messages';
import type { LineNotificationEvent } from './types';

type Data = Record<string, any>;

function bookingMessageData(booking: Data, extra: Data = {}): BookingMessageData {
  return {
    studentName: String(booking.studentName || 'นักเรียน'),
    courseTitle: String(booking.courseTitle || 'คอร์สเรียน'),
    bookingDate: String(booking.bookingDate || '-'),
    startTime: String(booking.startTime || '-'),
    endTime: String(booking.endTime || '-'),
    location: booking.locationName || booking.centerName || booking.location || (booking.isOnline ? 'เรียนออนไลน์' : undefined),
    attendeeCount: typeof extra.attendeeCount === 'number' ? extra.attendeeCount : undefined,
    maxStudents: typeof booking.maxStudents === 'number' ? booking.maxStudents : undefined,
    amount: typeof extra.amount === 'number' ? extra.amount : (typeof booking.price === 'number' ? booking.price : undefined),
    netAmount: typeof extra.netAmount === 'number' ? extra.netAmount : undefined,
  };
}

export function getBookingNotificationRecipients(
  status: string,
  booking: Data,
): Array<{ recipientUid: string; eventType: LineNotificationEvent; role: 'parent' | 'teacher' }> {
  if (status !== 'confirmed' && status !== 'cancelled') return [];
  const list: Array<{ recipientUid: string; eventType: LineNotificationEvent; role: 'parent' | 'teacher' }> = [];
  if (typeof booking.parentId === 'string' && booking.parentId.length > 0) {
    list.push({ recipientUid: booking.parentId, eventType: status === 'confirmed' ? 'booking.confirmed' : 'booking.cancelled', role: 'parent' });
  }
  if (typeof booking.teacherId === 'string' && booking.teacherId.length > 0) {
    list.push({ recipientUid: booking.teacherId, eventType: status === 'confirmed' ? 'booking.confirmed' : 'booking.cancelled', role: 'teacher' });
  }
  return list;
}

export async function enqueueBookingCreated(db: Firestore, bookingId: string, booking: Data): Promise<void> {
  if (!booking.teacherId) return;
  const sameSession = await db.collection('bookings')
    .where('courseId', '==', booking.courseId)
    .where('bookingDate', '==', booking.bookingDate)
    .get();
  const attendeeCount = sameSession.docs.filter((doc) => doc.data().status !== 'cancelled').length;
  await createLineOutbox(db, {
    recipientUid: booking.teacherId,
    eventType: 'booking.created',
    entityId: bookingId,
    messages: [bookingCreatedMessage(bookingMessageData(booking, { attendeeCount }))],
  });
}

export async function enqueueBookingStatusChanged(
  db: Firestore,
  bookingId: string,
  before: Data,
  after: Data,
): Promise<void> {
  if (before.status === after.status) return;
  const recipients = getBookingNotificationRecipients(after.status, after);
  for (const recipient of recipients) {
    await createLineOutbox(db, {
      recipientUid: recipient.recipientUid,
      eventType: recipient.eventType,
      entityId: bookingId,
      messages: [bookingStatusMessage(after.status, bookingMessageData(after), recipient.role)],
    });
  }
}

export async function enqueuePaymentChanged(
  db: Firestore,
  paymentId: string,
  before: Data | null,
  after: Data,
  booking: Data | null,
): Promise<void> {
  if (!booking || !after.status || before?.status === after.status) return;
  const data = bookingMessageData(booking, {
    amount: Number(after.amount) || 0,
    netAmount: Number(after.netAmount) || 0,
  });
  if (after.status === 'pending' && after.parentId) {
    await createLineOutbox(db, {
      recipientUid: after.parentId,
      eventType: 'payment.pending',
      entityId: paymentId,
      messages: [paymentMessage('pending', data)],
    });
  }
  if (after.status === 'paid') {
    if (after.parentId) {
      await createLineOutbox(db, {
        recipientUid: after.parentId,
        eventType: 'payment.paid',
        entityId: paymentId,
        messages: [paymentMessage('paid', data)],
      });
    }
    if (after.teacherId) {
      await createLineOutbox(db, {
        recipientUid: after.teacherId,
        eventType: 'payment.paid',
        entityId: paymentId,
        messages: [teacherPaymentPaidMessage(data)],
      });
    }
  }
}

export async function enqueueAttendanceChanged(
  db: Firestore,
  attendanceId: string,
  before: Data | null,
  after: Data,
  booking: Data | null,
): Promise<void> {
  if (!booking?.parentId || !after.status || before?.status === after.status) return;
  await createLineOutbox(db, {
    recipientUid: booking.parentId,
    eventType: 'attendance.changed',
    entityId: `${after.bookingId || booking.id || attendanceId}:${after.sessionDate || '-'}`,
    messages: [attendanceMessage({
      studentName: String(after.studentName || booking.studentName || 'นักเรียน'),
      sessionDate: String(after.sessionDate || booking.bookingDate || '-'),
      courseTitle: String(after.courseTitle || booking.courseTitle || ''),
      status: after.status,
      note: after.note ? String(after.note) : undefined,
    })],
  });
}

export async function enqueueSessionReportCreated(
  db: Firestore,
  reportId: string,
  report: Data,
): Promise<void> {
  if (!report.parentId) return;
  await createLineOutbox(db, {
    recipientUid: report.parentId,
    eventType: 'report.created',
    entityId: reportId,
    messages: [sessionReportMessage({
      studentName: String(report.studentName || 'นักเรียน'),
      courseTitle: String(report.courseTitle || 'คอร์สเรียน'),
      sessionDate: String(report.sessionDate || '-'),
      summary: report.summary ? String(report.summary) : (report.content ? String(report.content) : undefined),
      strengths: report.strengths ? String(report.strengths) : undefined,
      improvements: report.improvements ? String(report.improvements) : undefined,
      homework: report.homework ? String(report.homework) : undefined,
    })],
  });
}

export async function enqueuePaymentReleased(db: Firestore, bookingId: string, payment: Data): Promise<void> {
  if (!payment.teacherId) return;
  await createLineOutbox(db, {
    recipientUid: payment.teacherId,
    eventType: 'payment.released',
    entityId: bookingId,
    messages: [paymentReleasedMessage({
      courseTitle: String(payment.courseTitle || 'คอร์สเรียน'),
      studentName: String(payment.studentName || 'นักเรียน'),
      amount: Number(payment.payoutAmount ?? payment.netAmount) || 0,
    })],
  });
}

export async function enqueueClassReminder(
  db: Firestore,
  bookingId: string,
  booking: Data,
  options: { minutesRemaining?: number; daily?: boolean } = {}
): Promise<void> {
  const eventType: LineNotificationEvent = options.daily ? 'reminder.daily' : 'reminder.class';
  const entityId = `${bookingId}:${options.daily ? 'daily' : `${options.minutesRemaining || 30}m`}`;

  // Notify Parent
  if (booking.parentId) {
    await createLineOutbox(db, {
      recipientUid: booking.parentId,
      eventType,
      entityId,
      messages: [
        classReminderMessage({
          studentName: String(booking.studentName || 'นักเรียน'),
          courseTitle: String(booking.courseTitle || 'คอร์สเรียน'),
          bookingDate: String(booking.bookingDate || '-'),
          startTime: String(booking.startTime || '-'),
          endTime: String(booking.endTime || '-'),
          location: booking.locationName || booking.centerName || booking.location,
          meetingLink: booking.onlineMeetingUrl || booking.meetingLink,
          minutesRemaining: options.minutesRemaining,
          role: 'parent',
        }),
      ],
    });
  }

  // Notify Teacher for class reminder
  if (!options.daily && booking.teacherId) {
    await createLineOutbox(db, {
      recipientUid: booking.teacherId,
      eventType,
      entityId,
      messages: [
        classReminderMessage({
          studentName: String(booking.studentName || 'นักเรียน'),
          courseTitle: String(booking.courseTitle || 'คอร์สเรียน'),
          bookingDate: String(booking.bookingDate || '-'),
          startTime: String(booking.startTime || '-'),
          endTime: String(booking.endTime || '-'),
          location: booking.locationName || booking.centerName || booking.location,
          meetingLink: booking.onlineMeetingUrl || booking.meetingLink,
          minutesRemaining: options.minutesRemaining,
          role: 'teacher',
        }),
      ],
    });
  }
}
