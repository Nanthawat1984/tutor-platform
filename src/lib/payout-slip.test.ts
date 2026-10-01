import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { isSlipRequiredForPaid } from './payout-slip.ts';

test('ต้องแนบสลิปก่อนตั้งสถานะเป็น "โอนแล้ว"', () => {
  assert.equal(
    isSlipRequiredForPaid({ newStatus: 'paid', useConnect: false }),
    true,
  );
});

test('สลิปที่แนบไว้ก่อนแล้วถือว่ามีหลักฐาน', () => {
  assert.equal(
    isSlipRequiredForPaid({ newStatus: 'paid', useConnect: false, existingSlip: 'payout-slips/abc/slip-1.jpg' }),
    false,
  );
});

test('สลิปที่มากับฟอร์มรอบนี้ถือว่ามีหลักฐาน', () => {
  assert.equal(
    isSlipRequiredForPaid({ newStatus: 'paid', useConnect: false, submittedSlip: 'payout-slips/abc/slip-2.jpg' }),
    false,
  );
});

test('Stripe Connect ไม่ต้องแนบสลิปเพราะมี transfer id เป็นหลักฐาน', () => {
  assert.equal(
    isSlipRequiredForPaid({ newStatus: 'paid', useConnect: true }),
    false,
  );
});

test('สถานะอื่นไม่ต้องแนบสลิป', () => {
  assert.equal(isSlipRequiredForPaid({ newStatus: 'processing', useConnect: false }), false);
  assert.equal(isSlipRequiredForPaid({ newStatus: 'rejected', useConnect: false }), false);
});

test('สตริงว่างถือว่าไม่มีสลิป', () => {
  assert.equal(
    isSlipRequiredForPaid({ newStatus: 'paid', useConnect: false, existingSlip: '', submittedSlip: '' }),
    true,
  );
});