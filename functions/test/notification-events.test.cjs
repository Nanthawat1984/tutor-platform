const test = require('node:test');
const assert = require('node:assert/strict');

const { getBookingNotificationRecipients } = require('../lib/line/events.js');

const booking = { parentId: 'parent-1', teacherId: 'teacher-1' };

test('confirmed and cancelled booking events reach parent and teacher', () => {
  assert.deepEqual(getBookingNotificationRecipients('confirmed', booking), [
    { recipientUid: 'parent-1', eventType: 'booking.confirmed', role: 'parent' },
    { recipientUid: 'teacher-1', eventType: 'booking.confirmed', role: 'teacher' },
  ]);
  assert.deepEqual(getBookingNotificationRecipients('cancelled', booking), [
    { recipientUid: 'parent-1', eventType: 'booking.cancelled', role: 'parent' },
    { recipientUid: 'teacher-1', eventType: 'booking.cancelled', role: 'teacher' },
  ]);
});

test('non-notifying booking status has no LINE recipients', () => {
  assert.deepEqual(getBookingNotificationRecipients('completed', booking), []);
  assert.deepEqual(getBookingNotificationRecipients('confirmed', { parentId: '', teacherId: '' }), []);
});
