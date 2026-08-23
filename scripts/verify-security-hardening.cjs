const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const firestore = read('firestore.rules');
const storage = read('storage.rules');
const reviewPage = read('src/app/(parent)/bookings/[id]/review/page.tsx');
const uploadSlip = read('src/app/api/payments/upload-slip/route.ts');
const payoutSlip = read('src/app/api/admin/payout-slip/route.ts');
const kycUploader = read('src/components/teacher/kyc-file-uploader.tsx');
const parentBookings = read('src/app/(parent)/bookings/page.tsx');
const adminParents = read('src/app/admin/parents/page.tsx');
const adminStudents = read('src/app/admin/students/page.tsx');
const adminTeachers = read('src/app/admin/teachers/page.tsx');

assert.match(firestore, /affectedKeys\(\)\.hasAny\(\[[^\]]*'role'/s,
  'users role must be immutable to self-updates');
assert.match(firestore, /match \/payments\/\{paymentId\}[\s\S]*?allow create: if false;/,
  'payments must be server-created only');
assert.doesNotMatch(storage, /match \/payment-slips\/\{bookingId\}\/\{fileName\}[\s\S]*?allow read: if true;/,
  'payment slips must not be public');
assert.doesNotMatch(storage, /match \/kyc\/\{uid\}\/\{fileName\}[\s\S]*?allow read: if request\.auth != null;/,
  'teacher KYC must not be readable by every authenticated user');
assert.doesNotMatch(storage, /match \/payout-slips\/\{payoutId\}\/\{fileName\}[\s\S]*?allow read: if request\.auth != null;/,
  'payout slips must not be readable by every authenticated user');
assert.doesNotMatch(uploadSlip, /makePublic\s*\(/, 'payment slip upload must not make files public');
assert.match(payoutSlip, /requireAdmin\(\)/, 'admin payout slip upload must require an admin session');
assert.match(kycUploader, /\/api\/admin\/payout-slip/, 'payout slips must use the server upload path');
assert.doesNotMatch(kycUploader, /\[DEBUG kyc\]/, 'KYC uploader must not log authentication diagnostics');

assert.match(reviewPage, /params:\s*Promise<\{\s*id:\s*string\s*\}>/s,
  'review page must read the dynamic [id] route parameter');
assert.match(reviewPage, /booking\.parentId\s*!==\s*session\.uid|booking\.status\s*!==\s*'completed'/s,
  'review page must enforce booking ownership and completion');
assert.match(parentBookings, /requireSessionUser\(\)/,
  'booking cancellation action must re-check the session');
assert.match(parentBookings, /COLLECTIONS\.PAYMENTS[\s\S]*status[\s\S]*cancelled/,
  'booking cancellation must cancel pending payment records');
assert.match(parentBookings, /dbRef\.batch\(\)/,
  'booking and pending payment cancellation must be committed together');
for (const [name, source] of Object.entries({ adminParents, adminStudents, adminTeachers })) {
  assert.match(source, /requireAdmin\(\)/, `${name} actions must re-check admin session`);
}

console.log('Security hardening regression checks passed');
