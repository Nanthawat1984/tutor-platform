import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { getPostRegistrationPath } from './redirects.ts';

test('sends newly registered parents to their profile first', () => {
  assert.equal(getPostRegistrationPath('parent'), '/my-profile');
});

test('sends newly registered teachers to their profile editor first', () => {
  assert.equal(getPostRegistrationPath('teacher'), '/profile/edit');
});
