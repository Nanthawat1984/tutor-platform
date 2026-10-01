import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { sanitizeReportInput, isReportEmpty } from './session-report-validate.ts';

test('sanitize trims and caps length of text fields', () => {
  const result = sanitizeReportInput({
    topicsCovered: '  เรื่องเลขยกกำลัง  ',
    homework: 'x'.repeat(1500),
    notes: '   ',
  });
  assert.equal(result.topicsCovered, 'เรื่องเลขยกกำลัง');
  assert.ok(result.homework);
  assert.equal(result.homework.length, 1000);
  assert.equal(result.notes, null); // whitespace-only → null
});

test('sanitize converts blank score to null and keeps valid range', () => {
  assert.equal(sanitizeReportInput({ score: '' }).score, null);
  assert.equal(sanitizeReportInput({ score: 85 }).score, 85);
  assert.equal(sanitizeReportInput({ score: null }).score, null);
});

test('sanitize rejects out-of-range scores', () => {
  assert.equal(sanitizeReportInput({ score: 150 }).error, 'invalid_input');
  assert.equal(sanitizeReportInput({ score: -5 }).error, 'invalid_input');
  assert.equal(sanitizeReportInput({ score: 'abc' }).error, 'invalid_input');
});

test('isReportEmpty guards against fully empty reports', () => {
  assert.equal(isReportEmpty({ topicsCovered: null, homework: null, notes: null, score: null }), true);
  assert.equal(isReportEmpty({ topicsCovered: 'มีเนื้อหา', homework: null, notes: null, score: null }), false);
  assert.equal(isReportEmpty({ topicsCovered: null, homework: null, notes: null, score: 0 }), false); // score 0 นับว่ามีข้อมูล
});
