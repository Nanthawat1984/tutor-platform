export type ReconciliationPaymentStatus =
  | 'missing'
  | 'pending'
  | 'awaiting_review'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type ReconciliationEscrowStatus = 'not_paid' | 'pending' | 'released';
export type ReconciliationAttendanceStatus = 'not_recorded' | 'pending' | 'present' | 'absent' | 'late' | 'excused';
export type ReconciliationPayoutStatus = 'none' | 'requested' | 'processing' | 'paid' | 'rejected';

export interface ReconciliationBooking {
  id: string;
  teacherId: string;
  teacherName: string;
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  totalPrice: number;
}

export interface ReconciliationPayment {
  id: string;
  bookingId: string;
  teacherId?: string;
  status: string;
  method?: string;
  amount?: number;
  paidAtMillis?: number;
  createdAtMillis?: number;
  payoutAmount?: number;
  taxWithheldAtMillis?: number;
}

export interface ReconciliationAttendance {
  id: string;
  bookingId: string;
  status: string;
  updatedAtMillis?: number;
  createdAtMillis?: number;
}

export interface ReconciliationPayout {
  id: string;
  teacherId: string;
  status: string;
  amount?: number;
  createdAtMillis?: number;
}

export interface ReconciliationRow {
  bookingId: string;
  teacherId: string;
  teacherName: string;
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  bookingStatus: string;
  totalPrice: number;
  paymentId: string | null;
  paymentStatus: ReconciliationPaymentStatus;
  paymentMethod: string | null;
  paidAtMillis: number | null;
  paymentAmount: number;
  attendanceStatus: ReconciliationAttendanceStatus;
  escrowStatus: ReconciliationEscrowStatus;
  latestTeacherPayoutStatus: ReconciliationPayoutStatus;
}

export interface ReconciliationSummary {
  total: number;
  paid: number;
  awaitingReview: number;
  unpaid: number;
  escrowPending: number;
  escrowReleased: number;
}

function latestBy<T extends { createdAtMillis?: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items.reduce((latest, item) =>
    (item.createdAtMillis || 0) >= (latest.createdAtMillis || 0) ? item : latest,
  );
}

function normalizePaymentStatus(value: string | undefined): ReconciliationPaymentStatus {
  if (value === 'pending' || value === 'awaiting_review' || value === 'paid' || value === 'failed' || value === 'cancelled' || value === 'refunded') {
    return value;
  }
  return 'missing';
}

function normalizeAttendanceStatus(value: string | undefined): ReconciliationAttendanceStatus {
  if (value === 'pending' || value === 'present' || value === 'absent' || value === 'late' || value === 'excused') {
    return value;
  }
  return 'not_recorded';
}

function normalizePayoutStatus(value: string | undefined): ReconciliationPayoutStatus {
  if (value === 'requested' || value === 'processing' || value === 'paid' || value === 'rejected') {
    return value;
  }
  return 'none';
}

function getEscrowStatus(payment: ReconciliationPayment | null): ReconciliationEscrowStatus {
  if (!payment || payment.status !== 'paid') return 'not_paid';
  if (payment.payoutAmount !== undefined || payment.taxWithheldAtMillis !== undefined) return 'released';
  return 'pending';
}

export function buildReconciliationRows(input: {
  bookings: ReconciliationBooking[];
  payments: ReconciliationPayment[];
  attendance: ReconciliationAttendance[];
  payouts: ReconciliationPayout[];
}): ReconciliationRow[] {
  const paymentsByBooking = new Map<string, ReconciliationPayment>();
  const attendanceByBooking = new Map<string, ReconciliationAttendance>();
  const payoutsByTeacher = new Map<string, ReconciliationPayout>();

  for (const booking of input.bookings) {
    const payment = latestBy(input.payments.filter((item) => item.bookingId === booking.id));
    if (payment) paymentsByBooking.set(booking.id, payment);

    const attendance = latestBy(input.attendance.filter((item) => item.bookingId === booking.id));
    if (attendance) attendanceByBooking.set(booking.id, attendance);

    const payout = latestBy(input.payouts.filter((item) => item.teacherId === booking.teacherId));
    if (payout) payoutsByTeacher.set(booking.teacherId, payout);
  }

  return input.bookings.map((booking) => {
    const payment = paymentsByBooking.get(booking.id) || null;
    const attendance = attendanceByBooking.get(booking.id) || null;
    const payout = payoutsByTeacher.get(booking.teacherId) || null;
    const paymentStatus = normalizePaymentStatus(payment?.status);

    return {
      bookingId: booking.id,
      teacherId: booking.teacherId,
      teacherName: booking.teacherName,
      studentName: booking.studentName,
      courseTitle: booking.courseTitle,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      bookingStatus: booking.status,
      totalPrice: Number(booking.totalPrice) || 0,
      paymentId: payment?.id || null,
      paymentStatus,
      paymentMethod: payment?.method || null,
      paidAtMillis: payment?.paidAtMillis || null,
      paymentAmount: Number(payment?.amount ?? booking.totalPrice) || 0,
      attendanceStatus: normalizeAttendanceStatus(attendance?.status),
      escrowStatus: getEscrowStatus(payment),
      latestTeacherPayoutStatus: normalizePayoutStatus(payout?.status),
    } satisfies ReconciliationRow;
  });
}

export function summarizeReconciliationRows(rows: ReconciliationRow[]): ReconciliationSummary {
  return {
    total: rows.length,
    paid: rows.filter((row) => row.paymentStatus === 'paid').length,
    awaitingReview: rows.filter((row) => row.paymentStatus === 'awaiting_review').length,
    unpaid: rows.filter((row) => row.paymentStatus === 'missing' || row.paymentStatus === 'pending').length,
    escrowPending: rows.filter((row) => row.escrowStatus === 'pending').length,
    escrowReleased: rows.filter((row) => row.escrowStatus === 'released').length,
  };
}
