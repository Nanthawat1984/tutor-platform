import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { matchesParentSearch, summarizeParentActivity } from './parent-detail.ts';

test('matches a parent by UID even when the query uses different casing', () => {
  assert.equal(matchesParentSearch({
    uid: 'Parent-ABC-123',
    displayName: 'คุณแม่เอ',
    email: 'parent@example.com',
    phone: '0812345678',
  }, 'abc-123'), true);
});

test('does not match an unrelated parent search query', () => {
  assert.equal(matchesParentSearch({
    uid: 'parent-1',
    displayName: 'คุณแม่เอ',
    email: 'parent@example.com',
    phone: '0812345678',
  }, 'parent-2'), false);
});

test('summarizes parent activity and totals only paid payments', () => {
  assert.deepEqual(summarizeParentActivity(
    [{ id: 'student-1' }, { id: 'student-2' }],
    [{ id: 'booking-1' }, { id: 'booking-2' }, { id: 'booking-3' }],
    [
      { id: 'payment-1', status: 'paid', amount: 500 },
      { id: 'payment-2', status: 'pending', amount: 700 },
      { id: 'payment-3', status: 'paid', amount: 300 },
    ],
  ), {
    studentCount: 2,
    bookingCount: 3,
    paymentCount: 3,
    paidAmount: 800,
  });
});
