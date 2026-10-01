export type LineNotificationStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export type LineNotificationEvent =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'payment.pending'
  | 'payment.paid'
  | 'attendance.changed'
  | 'payment.released'
  | 'report.created';

export interface LineNotificationOutbox {
  recipientUid: string;
  lineUserId: string;
  eventType: LineNotificationEvent;
  entityId: string;
  messages: Array<Record<string, unknown>>;
  status: LineNotificationStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  sentAt?: unknown;
}
