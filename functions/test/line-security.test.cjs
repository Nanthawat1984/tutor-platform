const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { verifyLineWebhookSignature } = require('../lib/line/security.js');

test('accepts a valid LINE webhook signature', () => {
  const body = '{"events":[]}';
  const secret = 'test-secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyLineWebhookSignature(body, signature, secret), true);
});

test('rejects a changed body or signature', () => {
  const body = '{"events":[]}';
  const secret = 'test-secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyLineWebhookSignature('{"events":[1]}', signature, secret), false);
  assert.equal(verifyLineWebhookSignature(body, `${signature}x`, secret), false);
});
