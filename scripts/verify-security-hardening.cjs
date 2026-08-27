const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const firestore = read('firestore.rules');
const storage = read('storage.rules');
const reviewPage = read('src/app/(parent)/bookings/[id]/review/page.tsx');
const studentPhotoApi = read('src/app/api/students/[id]/photo/route.ts');
const studentPhotoUploader = read('src/components/parent/student-photo-uploader.tsx');
const uploadSlip = read('src/app/api/payments/upload-slip/route.ts');
const payoutSlip = read('src/app/api/admin/payout-slip/route.ts');
const kycUploader = read('src/components/teacher/kyc-file-uploader.tsx');
const parentBookings = read('src/app/(parent)/bookings/page.tsx');
const adminParents = read('src/app/admin/parents/page.tsx');
const adminStudents = read('src/app/admin/students/page.tsx');
const adminTeachers = read('src/app/admin/teachers/page.tsx');
const redirects = read('src/lib/auth/redirects.ts');
const loginForm = read('src/components/auth/login-form.tsx');
const newBooking = read('src/app/(parent)/bookings/new/page.tsx');
const seoSite = read('src/lib/seo/site.ts');
const publicTutor = read('src/app/tutors/[id]/page.tsx');
const publicTutors = read('src/app/tutors/page.tsx');

assert.match(firestore, /affectedKeys\(\)\.hasAny\(\[[^\]]*'role'/s,
  'users role must be immutable to self-updates');
assert.match(firestore, /match \/users\/{uid}[\s\S]*?allow create: if false;/,
  'users must be created by the server so clients cannot self-assign admin role');
assert.match(firestore, /match \/bookings\/{bookingId}[\s\S]*?allow update: if isAdmin\(\);/,
  'booking status changes must be server-only to protect escrow transitions');
assert.match(firestore, /match \/bookings\/{bookingId}[\s\S]*?allow create: if false;/,
  'booking creation must be server-only to prevent unvalidated or spam bookings');
assert.match(firestore, /match \/payments\/{paymentId}[\s\S]*?allow read: if false;/,
  'payment documents must be server-only because they contain internal fee and payout fields');
assert.match(firestore, /match \/payouts\/{payoutId}[\s\S]*?allow create: if false;/,
  'payout requests must be created by the server after wallet and KYC checks');
assert.match(firestore, /match \/payments\/\{paymentId\}[\s\S]*?allow create: if false;/,
  'payments must be server-created only');
assert.doesNotMatch(storage, /match \/payment-slips\/\{bookingId\}\/\{fileName\}[\s\S]*?allow read: if true;/,
  'payment slips must not be public');
assert.doesNotMatch(storage, /match \/kyc\/\{uid\}\/\{fileName\}[\s\S]*?allow read: if request\.auth != null;/,
  'teacher KYC must not be readable by every authenticated user');
assert.doesNotMatch(storage, /match \/payout-slips\/\{payoutId\}\/\{fileName\}[\s\S]*?allow read: if request\.auth != null;/,
  'payout slips must not be readable by every authenticated user');
assert.match(storage, /match \/profile-photos\/\{uid\}\/\{fileName\}[\s\S]*?request\.resource\.size < 5 \* 1024 \* 1024/s,
  'profile photos must enforce a server-side size limit');
assert.match(storage, /match \/profile-photos\/\{uid\}\/\{fileName\}[\s\S]*?request\.resource\.contentType/s,
  'profile photos must enforce a server-side content type allowlist');
assert.doesNotMatch(storage, /firestore\.get\(\/databases\/\(default\)\/documents\//,
  'Storage relationship checks must use the named tutor Firestore database');
assert.match(storage, /firestore\.get\(\/databases\/tutor\/documents\//,
  'Storage rules must resolve authorization data from the tutor database');
assert.match(storage, /match \/student-photos\/\{studentId\}\/\{fileName\}[\s\S]*?allow read, write: if false;/s,
  'student photos must use the protected server route instead of direct Storage access');
assert.match(studentPhotoApi, /export async function POST/,
  'student photo API must support authenticated server-side uploads');
assert.match(studentPhotoApi, /await request\.formData\(\)/,
  'student photo upload must parse the multipart file on the server');
assert.match(studentPhotoApi, /student\.parentId\s*!==\s*session\.uid/,
  'student photo upload must enforce parent ownership on the server');
assert.match(studentPhotoUploader, /\/api\/students\//,
  'student photo uploader must use the protected API');
assert.doesNotMatch(studentPhotoUploader, /uploadBytes|deleteObject/,
  'student photo uploader must not bypass the protected API with direct Storage writes');
assert.doesNotMatch(uploadSlip, /makePublic\s*\(/, 'payment slip upload must not make files public');
assert.match(payoutSlip, /requireAdmin\(\)/, 'admin payout slip upload must require an admin session');
assert.match(kycUploader, /\/api\/admin\/payout-slip/, 'payout slips must use the server upload path');
assert.doesNotMatch(kycUploader, /\[DEBUG kyc\]/, 'KYC uploader must not log authentication diagnostics');

assert.match(reviewPage, /params:\s*Promise<\{\s*id:\s*string\s*\}>/s,
  'review page must read the dynamic [id] route parameter');
assert.match(reviewPage, /booking\.parentId\s*!==\s*session\.uid|booking\.status\s*!==\s*'completed'/s,
  'review page must enforce booking ownership and completion');
assert.match(reviewPage, /<Link\s+href="\/bookings"/s,
  'review page must use a server-safe link for cancellation');
assert.doesNotMatch(reviewPage, /onClick=\{\(\) => history\.back\(\)\}/,
  'server review page must not pass an inline browser event handler to a client component');
assert.equal(fs.existsSync(path.join(root, 'src/app/icon.svg')), true,
  'app must provide a favicon asset');
assert.match(parentBookings, /requireSessionUser\(\)/,
  'booking cancellation action must re-check the session');
assert.match(parentBookings, /COLLECTIONS\.PAYMENTS[\s\S]*status[\s\S]*cancelled/,
  'booking cancellation must cancel pending payment records');
assert.match(parentBookings, /dbRef\.batch\(\)/,
  'booking and pending payment cancellation must be committed together');
assert.match(redirects, /getSafeRedirectPath/,
  'post-login redirects must be validated as local paths');
assert.match(loginForm, /getSafeRedirectPath\(/,
  'login form must not navigate to an untrusted external redirect');
assert.match(newBooking, /student(?:\?\.|\.)parentId\s*!==\s*(?:current\.session\.uid|parentId)/,
  'booking creation must verify the selected student belongs to the current parent');
assert.match(seoSite, /serializeJsonLd/,
  'JSON-LD serialization must escape script-breaking characters');
assert.match(publicTutor, /serializeJsonLd\(jsonLd\)/,
  'public tutor JSON-LD must use safe serialization');
assert.match(publicTutors, /serializeJsonLd\(itemList\)/,
  'public tutor list JSON-LD must use safe serialization');
for (const [name, source] of Object.entries({ adminParents, adminStudents, adminTeachers })) {
  assert.match(source, /requireAdmin\(\)/, `${name} actions must re-check admin session`);
}

console.log('Security hardening regression checks passed');
