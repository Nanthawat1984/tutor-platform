import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { checkRateLimit } from './rate-limit.ts';

test('allows requests under the limit and reports remaining quota', () => {
  const key = `test-${Date.now()}-a`;
  const first = checkRateLimit(key, 3, 60_000, 1000);
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 2);
  const second = checkRateLimit(key, 3, 60_000, 1001);
  assert.equal(second.ok, true);
  assert.equal(second.remaining, 1);
});

test('blocks requests over the limit until the window resets', () => {
  const key = `test-${Date.now()}-b`;
  checkRateLimit(key, 2, 60_000, 2000);
  checkRateLimit(key, 2, 60_000, 2001);
  const blocked = checkRateLimit(key, 2, 60_000, 2002);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetAfterMs > 0);
  const afterReset = checkRateLimit(key, 2, 60_000, 2000 + 60_000);
  assert.equal(afterReset.ok, true);
});

test('tracks different identifiers independently', () => {
  const now = Date.now();
  const one = checkRateLimit(`test-${now}-c1`, 1, 60_000, now);
  assert.equal(one.ok, true);
  const oneAgain = checkRateLimit(`test-${now}-c1`, 1, 60_000, now + 1);
  assert.equal(oneAgain.ok, false);
  const other = checkRateLimit(`test-${now}-c2`, 1, 60_000, now + 1);
  assert.equal(other.ok, true);
});
