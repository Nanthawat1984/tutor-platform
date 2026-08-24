import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { getRoleHomePath } from './role-routes.ts';

test('routes admin away from parent-only pages to the admin dashboard', () => {
  assert.equal(getRoleHomePath('admin'), '/admin/dashboard');
});

test('routes teachers away from parent-only pages to the teacher dashboard', () => {
  assert.equal(getRoleHomePath('teacher'), '/dashboard');
});

test('keeps parents on the parent dashboard', () => {
  assert.equal(getRoleHomePath('parent'), '/my-bookings');
});
