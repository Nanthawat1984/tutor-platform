const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const parentPaymentFiles = [
  ['bookings', '[id]', 'payment', 'page.tsx'],
  ['bookings', '[id]', 'payment', 'success', 'page.tsx'],
  ['payments', 'page.tsx'],
];

for (const fileParts of parentPaymentFiles) {
  const filePath = path.join(__dirname, '..', 'src', 'app', '(parent)', ...fileParts);
  const source = fs.readFileSync(filePath, 'utf8');

  assert.doesNotMatch(source, /ค่าบริการแพลตฟอร์ม/);
  assert.doesNotMatch(source, /ครูจะได้รับ/);
}

const paymentPageSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', '(parent)', ...parentPaymentFiles[0]),
  'utf8',
);
assert.match(paymentPageSource, /ค่าคอร์ส/);
assert.match(paymentPageSource, /ยอดชำระ/);

console.log('Parent payment privacy check passed');
