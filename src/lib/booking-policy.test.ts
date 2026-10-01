import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { decideReschedule, decideCancel, hoursUntilSession, FREE_RESCHEDULE_HOURS, MAX_FREE_RESCHEDULES } from './booking-policy.ts';

const BASE = new Date('2026-03-10T10:00:00+07:00').getTime(); // อังคาร 10:00 ไทย

function slot(hoursAhead: number): { bookingDate: string; startTime: string } {
  const start = new Date(BASE + hoursAhead * 3_600_000);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(start);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(start);
  return { bookingDate: date, startTime: time };
}

test('hoursUntilSession computes time remaining in Bangkok time', () => {
  const s = slot(48);
  const hours = hoursUntilSession(s.bookingDate, s.startTime, BASE);
  assert.ok(Math.abs((hours ?? 0) - 48) < 0.01);
});

test('hoursUntilSession returns null for malformed input', () => {
  assert.equal(hoursUntilSession('not-a-date', '10:00', BASE), null);
  assert.equal(hoursUntilSession('2026-03-10', '25:99', BASE), null);
});

test('reschedule allowed free when ≥24h ahead', () => {
  const decision = decideReschedule({ status: 'confirmed', ...slot(48), rescheduleCount: 0, nowMs: BASE });
  assert.equal(decision.allowed, true);
  assert.ok(decision.allowed && decision.free === true && decision.late === false);
});

test('reschedule allowed but flagged late when <24h ahead', () => {
  const decision = decideReschedule({ status: 'confirmed', ...slot(5), rescheduleCount: 0, nowMs: BASE });
  assert.equal(decision.allowed, true);
  assert.ok(decision.allowed && decision.free === false && decision.late === true);
});

test('reschedule blocked after max free reschedules when ≥24h ahead', () => {
  const decision = decideReschedule({
    status: 'confirmed', ...slot(48), rescheduleCount: MAX_FREE_RESCHEDULES, nowMs: BASE,
  });
  assert.deepEqual(decision, { allowed: false, reason: 'too_many_reschedules' });
});

test('reschedule still allowed after max count when late (<24h)', () => {
  // กติกา: เลื่อนสายได้แต่ติดธง — บล็อกเฉพาะเลื่อนฟรีเกินจำนวนครั้ง
  const decision = decideReschedule({
    status: 'confirmed', ...slot(5), rescheduleCount: MAX_FREE_RESCHEDULES, nowMs: BASE,
  });
  assert.equal(decision.allowed, true);
  assert.ok(decision.allowed && decision.late === true);
});

test('reschedule blocked for past session and invalid status', () => {
  const past = decideReschedule({ status: 'confirmed', ...slot(-2), nowMs: BASE });
  assert.deepEqual(past, { allowed: false, reason: 'past_session' });
  const done = decideReschedule({ status: 'completed', ...slot(48), nowMs: BASE });
  assert.deepEqual(done, { allowed: false, reason: 'invalid_status' });
});

test('cancel full refund ≥24h, half refund <24h, none in past', () => {
  const full = decideCancel({ status: 'confirmed', ...slot(48), nowMs: BASE });
  assert.equal(full.refund, 'full');
  const half = decideCancel({ status: 'confirmed', ...slot(5), nowMs: BASE });
  assert.equal(half.refund, 'half');
  const none = decideCancel({ status: 'confirmed', ...slot(-2), nowMs: BASE });
  assert.equal(none.refund, 'none');
});

test('policy constants stay in sync with the documented rules', () => {
  assert.equal(FREE_RESCHEDULE_HOURS, 24);
  assert.equal(MAX_FREE_RESCHEDULES, 2);
});
