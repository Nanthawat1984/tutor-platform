import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { normalizeLoginIdentifier } from './admin-login.ts';

test('maps the Superadmin ID to the internal Firebase email', () => {
  assert.equal(normalizeLoginIdentifier('Superadmin'), 'superadmin@tutorfinder.app');
  assert.equal(normalizeLoginIdentifier(' superadmin '), 'superadmin@tutorfinder.app');
});

test('leaves ordinary email login identifiers unchanged', () => {
  assert.equal(normalizeLoginIdentifier('parent@example.com'), 'parent@example.com');
});
