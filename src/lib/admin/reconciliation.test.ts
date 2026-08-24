import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { buildReconciliationRows, summarizeReconciliationRows, type ReconciliationBooking, type ReconciliationPayment } from './reconciliation.ts';

const booking: ReconciliationBooking = {
  id: 'booking-1',
  teacherId: 'teacher-1',
  teacherName: 'ครูเอ',
  studentName: 'น้องบี',
  courseTitle: 'คณิตศาสตร์',
  bookingDate: '2026-08-24',
  startTime: '16:30',
  endTime: '17:30',
  status: 'pending',
  totalPrice: 500,
};

test('uses the latest payment for each booking and marks a paid booking clearly', () => {
  const payments: ReconciliationPayment[] = [
    { id: 'payment-old', bookingId: 'booking-1', status: 'pending', amount: 500, createdAtMillis: 1 },
    { id: 'payment-new', bookingId: 'booking-1', status: 'paid', amount: 500, paidAtMillis: 3, createdAtMillis: 3, payoutAmount: 390 },
  ];

  const [row] = buildReconciliationRows({ bookings: [booking], payments, attendance: [], payouts: [] });

  assert.equal(row.paymentId, 'payment-new');
  assert.equal(row.paymentStatus, 'paid');
  assert.equal(row.escrowStatus, 'released');
});

test('distinguishes missing payment, awaiting review, and pending escrow', () => {
  const rows = buildReconciliationRows({
    bookings: [
      booking,
      { ...booking, id: 'booking-2', studentName: 'น้องซี' },
      { ...booking, id: 'booking-3', studentName: 'น้องดี' },
    ],
    payments: [
      { id: 'payment-review', bookingId: 'booking-2', status: 'awaiting_review', amount: 500, createdAtMillis: 2 },
      { id: 'payment-paid', bookingId: 'booking-3', status: 'paid', amount: 500, createdAtMillis: 3 },
    ],
    attendance: [],
    payouts: [],
  });

  assert.deepEqual(rows.map((row) => [row.paymentStatus, row.escrowStatus]), [
    ['missing', 'not_paid'],
    ['awaiting_review', 'not_paid'],
    ['paid', 'pending'],
  ]);
});

test('summarizes reconciliation rows for admin cards', () => {
  const rows = buildReconciliationRows({
    bookings: [booking, { ...booking, id: 'booking-2' }, { ...booking, id: 'booking-3' }],
    payments: [
      { id: 'payment-review', bookingId: 'booking-2', status: 'awaiting_review', amount: 500, createdAtMillis: 2 },
      { id: 'payment-paid', bookingId: 'booking-3', status: 'paid', amount: 500, createdAtMillis: 3, payoutAmount: 390 },
    ],
    attendance: [],
    payouts: [],
  });

  assert.deepEqual(summarizeReconciliationRows(rows), {
    total: 3,
    paid: 1,
    awaitingReview: 1,
    unpaid: 1,
    escrowPending: 0,
    escrowReleased: 1,
  });
});
