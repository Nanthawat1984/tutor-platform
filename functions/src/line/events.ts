import type { Firestore } from 'firebase-admin/firestore';
import { createLineOutbox } from './outbox';
import {
  attendanceMessage,
  bookingCreatedMessage,
  bookingStatusMessage,
  paymentMessage,
  paymentReleasedMessage,
  teacherPaymentPaidMessage,
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
    amount: typeof extra.amount === 'number' ? extra.amount : undefined,
    netAmount: typeof extra.netAmount === 'number' ? extra.netAmount : undefined,
  };
}

export function getBookingNotificationRecipients(
  status: string,
  booking: Data,
): Array<{ recipientUid: string; eventType: LineNotificationEvent }> {
  if (status !== 'confirmed' && status !== 'cancelled') return [];
  return [booking.parentId, booking.teacherId]
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    .map((recipientUid) => ({ recipientUid, eventType: status === 'confirmed' ? 'booking.confirmed' : 'booking.cancelled' }));
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
      messages: [bookingStatusMessage(after.status, bookingMessageData(after))],
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
      status: after.status,
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
