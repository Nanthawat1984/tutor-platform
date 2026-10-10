const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBookingFlexMessage,
  createAttendanceFlexMessage,
  createPaymentFlexMessage,
  createSessionReportFlexMessage,
  createQuickClassReminderFlexMessage,
} = require('../lib/line/flex-messages.js');

test('creates valid Booking flex message with bubble container', () => {
  const msg = createBookingFlexMessage(
    '📚 มีการจองเรียนใหม่',
    'รอการสอน',
    '#4F46E5',
    {
      studentName: 'น้องน้ำมนต์',
      courseTitle: 'คณิตศาสตร์ ม.3 สอบเข้าเตรียมฯ',
      bookingDate: '2026-10-15',
      startTime: '10:00',
      endTime: '12:00',
      amount: 1200,
      netAmount: 1020,
    },
    'parent'
  );

  assert.equal(msg.type, 'flex');
  assert.ok(msg.altText.includes('น้องน้ำมนต์'));
  assert.equal(msg.contents.type, 'bubble');
  assert.equal(msg.contents.body.type, 'box');
  assert.ok(msg.contents.footer.contents[0].action.uri);
});

test('creates valid Attendance flex message with color-coded status', () => {
  const msg = createAttendanceFlexMessage({
    studentName: 'น้องเก้า',
    sessionDate: '2026-10-15',
    courseTitle: 'ภาษาอังกฤษ IELTS',
    status: 'present',
    note: 'ตั้งใจตอบคำถามดีมากครับ',
  });

  assert.equal(msg.type, 'flex');
  assert.ok(msg.altText.includes('เข้าเรียนตรงเวลา'));
  assert.equal(msg.contents.header.backgroundColor, '#059669');
});

test('creates valid Payment flex message for unpaid and paid status', () => {
  const pending = createPaymentFlexMessage({
    studentName: 'น้องพลอย',
    courseTitle: 'ฟิสิกส์ สอวน.',
    amount: 2500,
    status: 'pending',
  });
  assert.equal(pending.type, 'flex');
  assert.ok(pending.altText.includes('แจ้งยอดชำระ'));

  const paid = createPaymentFlexMessage({
    studentName: 'น้องพลอย',
    courseTitle: 'ฟิสิกส์ สอวน.',
    amount: 2500,
    status: 'paid',
  });
  assert.equal(paid.type, 'flex');
  assert.ok(paid.altText.includes('ยืนยันชำระเงินเรียบร้อย'));
});

test('creates valid Session Report flex message with homework card', () => {
  const msg = createSessionReportFlexMessage({
    studentName: 'น้องบอย',
    courseTitle: 'เคมี ม.5',
    sessionDate: '2026-10-12',
    summary: 'สมดุลเคมีและค่าคงที่สมดุล K',
    strengths: 'จำสูตรได้แม่นยำ',
    improvements: 'การคำนวณทศนิยม 2 ตำแหน่ง',
    homework: 'ทำแบบฝึกหัดหน้า 45 ข้อ 1-5',
  });

  assert.equal(msg.type, 'flex');
  assert.ok(msg.altText.includes('สมุดพกรายงานผลการเรียน'));
  assert.equal(msg.contents.type, 'bubble');
});

test('creates valid 30m Class Reminder flex message', () => {
  const msg = createQuickClassReminderFlexMessage({
    studentName: 'น้องฟ้า',
    courseTitle: 'ชีววิทยา ม.ปลาย',
    bookingDate: '2026-10-15',
    startTime: '14:00',
    endTime: '16:00',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    minutesRemaining: 30,
  });

  assert.equal(msg.type, 'flex');
  assert.ok(msg.altText.includes('30 นาที'));
  assert.equal(msg.contents.footer.contents[0].action.uri, 'https://meet.google.com/abc-defg-hij');
});
