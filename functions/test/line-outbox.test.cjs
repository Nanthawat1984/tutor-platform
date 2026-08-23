const test = require('node:test');
const assert = require('node:assert/strict');

const { makeLineOutboxId } = require('../lib/line/outbox.js');

test('uses one deterministic outbox ID per event, entity, and recipient', () => {
  const first = makeLineOutboxId('booking.created', 'booking-1', 'user-1');
  const second = makeLineOutboxId('booking.created', 'booking-1', 'user-1');
  const otherRecipient = makeLineOutboxId('booking.created', 'booking-1', 'user-2');

  assert.equal(first, second);
  assert.notEqual(first, otherRecipient);
  assert.match(first, /^[a-f0-9]{64}$/);
});
