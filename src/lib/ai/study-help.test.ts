import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { buildStudyHelpPrompt } from './study-help.ts';

test('prompt stays in Thai and refuses to give copy-paste homework answers', () => {
  const prompt = buildStudyHelpPrompt({
    topicsCovered: 'สมการเชิงเส้นตัวแปรเดียว',
    homework: 'แบบฝึกหัดหน้า 42 ข้อ 1-5',
    courseTitle: 'คณิต ม.2',
  });
  assert.match(prompt, /ภาษาไทย/);
  assert.match(prompt, /ห้ามให้คำตอบการบ้านแบบลอกได้/);
  assert.match(prompt, /สมการเชิงเส้น/);
});

test('prompt truncates long teacher input to bound token cost', () => {
  const prompt = buildStudyHelpPrompt({ notes: 'ก'.repeat(5000) });
  assert.ok(prompt.length < 4000, `prompt too long: ${prompt.length}`);
});

test('prompt handles empty reports without crashing', () => {
  const prompt = buildStudyHelpPrompt({});
  assert.match(prompt, /ไม่ระบุ/);
});
