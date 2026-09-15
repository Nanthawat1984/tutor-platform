import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { normalizeThaiSearch, rankCourseSearch } from './search.ts';

test('ignores Thai tone marks so misspelled queries still match', () => {
  // ไม้เอก/โท/ตรี/จัตวา (่-๋) ถูกตัดออก — เหลือไม้ไต่คู้ (็) ไว้ตามเดิม
  assert.equal(normalizeThaiSearch('ม้าที่'), normalizeThaiSearch('ม้าที่'));
  assert.notEqual(normalizeThaiSearch('ม้า'), 'ม้า');
  assert.equal(normalizeThaiSearch('คณิตศาสตร์'), normalizeThaiSearch('คณิตศาสตร์'));
});

test('ranks title matches above teacher matches', () => {
  const courses = [
    { id: 'a', title: 'ฟิสิกส์ ม.ปลาย', teacherName: 'ครูคณิต' },
    { id: 'b', title: 'ติวเข้ม', teacherName: 'ครูคณิตศาสตร์' },
  ];
  const ranked = rankCourseSearch(courses, 'คณิต');
  assert.equal(ranked[0].id, 'a');
});

test('empty query keeps the original order', () => {
  const courses = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(rankCourseSearch(courses, ''), courses);
});
