import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { classifyPasswordResetError } from './password-reset.ts';

test('does not reveal whether an email has an account', () => {
  assert.equal(classifyPasswordResetError({ code: 'auth/user-not-found' }), 'sent');
});

test('reports invalid email input separately', () => {
  assert.equal(classifyPasswordResetError({ code: 'auth/invalid-email' }), 'invalid_email');
});

test('reports Firebase rate limiting separately', () => {
  assert.equal(classifyPasswordResetError({ code: 'auth/too-many-requests' }), 'rate_limited');
});

test('falls back to a generic failure for unknown errors', () => {
  assert.equal(classifyPasswordResetError(new Error('network failure')), 'failed');
});
