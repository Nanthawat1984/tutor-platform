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
const parentLayout = read('src/app/(parent)/layout.tsx');
const parentProfile = read('src/app/(parent)/my-profile/page.tsx');
const teacherProfile = read('src/app/(teacher)/profile/edit/page.tsx');
const lineLinkCard = read('src/components/line/line-link-card.tsx');
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
const paymentProcess = read('src/lib/payments/process.ts');
const functionsIndex = read('functions/src/index.ts');
const attendancePage = read('src/app/(teacher)/attendance/page.tsx');
const bookingQueries = read('src/lib/firestore/queries.ts');
const rateLimit = read('src/lib/rate-limit.ts');
const uploadSlipRoute = read('src/app/api/payments/upload-slip/route.ts');
const adminPayoutSlip = read('src/app/api/admin/payout-slip/route.ts');
const healthRoute = read('src/app/api/health/route.ts');
const opsSnapshot = read('src/app/api/admin/ops-snapshot/route.ts');
const appLog = read('src/lib/log.ts');
const stripeWebhook = read('src/app/api/payments/stripe-webhook/route.ts');
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
assert.match(parentLayout, /requireRole\(\['parent'\]\)/,
  'parent route group must reject teacher and admin sessions');
assert.doesNotMatch(parentProfile, /session\.role === 'teacher'/,
  'teacher LINE handoff must not depend on the parent route group');
assert.match(teacherProfile, /handoffPath="\/profile\/edit"/,
  'teacher LINE handoff must stay inside the teacher route group');
assert.match(lineLinkCard, /handoffPath/,
  'LINE link card must support role-specific handoff paths');
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

// ── P0 money-safety regression (escrow parity, idempotency, webhook, timezone) ──
assert.match(paymentProcess, /TAX_WITHHOLDING_RATE/,
  'app escrow release must withhold 3% tax');
assert.match(paymentProcess, /taxWithheldAt|payoutAmount/,
  'app escrow release must write idempotency markers so a retry is a no-op');
assert.match(functionsIndex, /TAX_WITHHOLDING_RATE/,
  'functions escrow release must withhold the same 3% tax as the app');
assert.match(functionsIndex, /taxWithheldAt/,
  'functions escrow release must write the same idempotency marker as the app');
assert.match(functionsIndex, /deprecated_endpoint/,
  'legacy paymentWebhook must be a deprecated stub, never writing payment status');
assert.doesNotMatch(functionsIndex, /case 'charge\.complete'/,
  'legacy Omise charge handler must be removed from functions');
assert.match(functionsIndex, /dailyBookingReminder[\s\S]{0,600}Intl\.DateTimeFormat\('en-CA',\s*\{\s*timeZone:\s*'Asia\/Bangkok'/,
  'daily reminder must compute today in Asia/Bangkok, not UTC');
assert.match(attendancePage, /doc\(`\$\{booking\.id\}_\$\{selectedDate\}`\)/,
  'teacher attendance must use a deterministic doc ID so double-submit cannot duplicate');
assert.match(attendancePage, /Asia\/Bangkok/,
  'attendance default date must use Asia/Bangkok, not UTC');
assert.match(parentBookings, /awaiting_review/,
  'booking cancellation must also cancel awaiting_review slip payments');

// ── P1 reliability regression (rate-limit, health, ops, logging) ──
assert.match(rateLimit, /checkRateLimit/,
  'upload endpoints must share a rate limiter');
assert.match(uploadSlipRoute, /checkRateLimit\(`slip:/,
  'parent slip upload must be rate-limited per user');
assert.match(uploadSlipRoute, /status:\s*429/,
  'rate-limited slip upload must return 429 with Retry-After');
assert.match(adminPayoutSlip, /checkRateLimit\(`payout-slip:/,
  'admin payout-slip upload must be rate-limited per admin');
assert.match(healthRoute, /\/api\/health|integrations/,
  'health probe must report integration flags without secrets');
assert.doesNotMatch(healthRoute, /process\.env\.STRIPE_SECRET_KEY[^?]/,
  'health probe must only read secrets as booleans, never return their values');
assert.match(opsSnapshot, /role !== 'admin'/,
  'ops snapshot must require an admin session');
assert.doesNotMatch(opsSnapshot, /\.\.\.d\.data\(\)/,
  'ops snapshot must return counts only, never document bodies');
assert.match(appLog, /severity/,
  'server logging must emit structured severity lines');
assert.match(appLog, /pass IDs and counts only/,
  'shared logger must document that only IDs and counts are logged');
assert.match(stripeWebhook, /logEvent\('error', 'stripe_webhook_processing_failed'/,
  'stripe webhook failures must emit a structured error event');

// ── P2 product-safety regression (explore cost, real stats, notifications, exports) ──
const explorePage = read('src/app/(parent)/explore/page.tsx');
const landingPage = read('src/app/page.tsx');
const notifApi = read('src/app/api/notifications/route.ts');
const taxCert = read('src/app/(teacher)/earnings/tax-certificate/page.tsx');
const adminPayouts = read('src/app/admin/payouts/page.tsx');
assert.doesNotMatch(explorePage, /\.limit\(500\)/,
  'explore must not scan hundreds of centers on every page load');
assert.doesNotMatch(landingPage, /2,400\+|18,000\+|120\+/,
  'landing must not show hardcoded marketing stats');
assert.match(landingPage, /getPublicStats/,
  'landing stats must come from real Firestore counts');
assert.match(notifApi, /where\('userId', '==', session\.uid\)/,
  'notification API must scope reads to the session owner');
assert.match(notifApi, /snap\.data\(\)\?\.userId !== session\.uid/,
  'notification read must verify ownership before marking');
assert.match(taxCert, /CsvExportButton/,
  '50 ทวิ must offer a CSV export for filing');
assert.match(adminPayouts, /CsvExportButton/,
  'admin payouts must offer a CSV export');

// ── New-features regression (chat, coupons, PDPA, SW, search, alerts) ──
const chatApi = read('src/app/api/chat/route.ts');
const couponApi = read('src/app/api/coupons/validate/route.ts');
const meExport = read('src/app/api/me/export/route.ts');
assert.match(chatApi, /assertParty/,
  'chat API must verify the caller is a party of the booking');
assert.match(chatApi, /checkRateLimit\(`chat:/,
  'chat send must be rate-limited per user');
assert.doesNotMatch(chatApi, /allow read/,
  'chat authorization must live in the API, never in client rules');
assert.match(couponApi, /usedCount/,
  'coupon validation must check usage limits server-side');
assert.match(meExport, /where\('parentId', '==', session\.uid\)/,
  'PDPA export must scope every collection to the session owner');
assert.match(read('firestore.rules'), /match \/messages\/\{messageId\}[\s\S]*?allow read, write: if false;/,
  'chat messages must be server-only in Firestore rules');

// ── Print regression (50 ทวิ / tax-document / progress must print) ──
const globalStyles = read('src/app/globals.css');
const taxCertPage = read('src/app/(teacher)/earnings/tax-certificate/page.tsx');
const taxDocPage = read('src/app/(teacher)/earnings/tax-document/page.tsx');
const progressPage = read('src/app/(parent)/progress/page.tsx');
assert.match(globalStyles, /\.print-document/,
  'print stylesheet must cover generic print documents, not only receipts');
assert.match(taxCertPage, /print-document/,
  '50 ทวิ must carry the print-document class or printing is blank');
assert.match(taxDocPage, /print-document/,
  'tax document must carry the print-document class or printing is blank');
assert.match(progressPage, /print-document/,
  'progress report must carry the print-document class or printing is blank');

// ── P3 growth regression (PWA, scoped AI, analytics) ──
const appLayout = read('src/app/layout.tsx');
const aiRoute = read('src/app/api/ai/study-help/route.ts');
const aiLib = read('src/lib/ai/study-help.ts');
const analyticsPage = read('src/app/admin/analytics/page.tsx');
assert.match(appLayout, /manifest:\s*'\/manifest\.webmanifest'/,
  'app must link the PWA manifest');
assert.equal(fs.existsSync(path.join(root, 'public/icon-192.png')), true,
  'PWA manifest icons must exist as real files');
assert.equal(fs.existsSync(path.join(root, 'public/icon-512.png')), true,
  'PWA manifest icons must exist as real files');
assert.equal(fs.existsSync(path.join(root, 'public/apple-touch-icon.png')), true,
  'iOS touch icon must exist as a real file');
assert.match(aiRoute, /report\.teacherId !== session\.uid/,
  'AI study-help must verify teacher ownership of the report');
assert.match(aiRoute, /if \(report\.aiExplanation\)/,
  'AI study-help must be idempotent and return the stored version');
assert.match(aiRoute, /checkRateLimit\(`ai:/,
  'AI study-help must be rate-limited per teacher');
assert.match(aiLib, /ห้ามให้คำตอบการบ้านแบบลอกได้/,
  'AI study-help must refuse copy-paste homework answers by prompt');
assert.match(analyticsPage, /requireAdmin\(\)/,
  'growth analytics must require an admin session');
assert.doesNotMatch(analyticsPage, /\.limit\(1000\)/,
  'growth analytics must cap Firestore reads');

// ── Chat + notifications bugfix regression (composite indexes + error UI) ──
const indexesJson = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const indexKeys = new Set(
  indexesJson.indexes.map((idx) => `${idx.collectionGroup}|${idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join(',')}`)
);
for (const expected of [
  'messages|bookingId:ASCENDING,createdAt:ASCENDING',
  'notifications|userId:ASCENDING,createdAt:DESCENDING',
  'notifications|userId:ASCENDING,isRead:ASCENDING',
  'bookings|teacherId:ASCENDING,status:ASCENDING,bookingDate:DESCENDING',
]) {
  assert.ok(indexKeys.has(expected), `missing composite index: ${expected}`);
}
const chatBox = read('src/components/chat/chat-box.tsx');
const bell = read('src/components/notifications/notification-bell.tsx');
assert.match(chatApi, /index_building/,
  'chat API must return a retryable status while indexes build');
assert.match(chatBox, /โหลดข้อความไม่สำเร็จ/,
  'chat UI must show an error instead of silent empty state');
assert.match(bell, /โหลดการแจ้งเตือนไม่สำเร็จ/,
  'notification bell must show an error instead of silent empty state');

// ── 50 ทวิ legal compliance regression (มาตรา 50 ทวิ) ──
const taxCertLegal = read('src/app/(teacher)/earnings/tax-certificate/page.tsx');
const taxDocLegal = read('src/app/(teacher)/earnings/tax-document/page.tsx');
assert.match(taxCertLegal, /taxWithheldAt/,
  '50 ทวิ must use the withholding date (taxWithheldAt), not the payment date');
assert.match(taxCertLegal, /40\(2\)/,
  '50 ทวิ must state the income category 40(2)');
assert.match(taxCertLegal, /ท\.ป\. 4\/2528/,
  '50 ทวิ must cite the 3% withholding authority');
assert.match(taxCertLegal, /TF50-/,
  '50 ทวิ must carry a document number');
assert.match(taxCertLegal, /มาตรา 50 ทวิ/,
  '50 ทวิ must cite Section 50-bis of the Revenue Code');
assert.match(taxCertLegal, /2 ฉบับ/,
  '50 ทวิ must state the two-copy rule');
assert.match(taxDocLegal, /มิใช่ใบกำกับภาษี/,
  'income certificate must disclaim VAT-invoice status');
assert.match(taxDocLegal, /กระทบยอดกับ 50 ทวิ/,
  'income certificate must reconcile against 50 ทวิ');

// ── Full Revenue-Code compliance (ที่อยู่แยก, ฉบับร่าง, แผ่นที่, threshold) ──
assert.match(taxCertLegal, /ภ\.ง\.ด\.53/,
  '50 ทวิ must state the filing form Phor.Ngor.Dor.53');
assert.match(taxCertLegal, /หักจากผู้รับเงิน/,
  '50 ทวิ must state who bears the withheld tax');
assert.match(taxCertLegal, /ฉบับร่าง/,
  '50 ทวิ must stamp DRAFT when tax IDs are incomplete');
assert.match(taxCertLegal, /แผ่นที่/,
  '50 ทวิ must number pages when rows span multiple sheets');
assert.match(taxCertLegal, /คราวละ 1,000 บาท/,
  '50 ทวิ must state the 1,000-baht withholding threshold');
const escrowLib = read('src/lib/payments/process.ts');
assert.match(escrowLib, /TAX_WITHHOLDING_THRESHOLD/,
  'escrow release must enforce the 1,000-baht threshold');
assert.match(escrowLib, /taxExemptReason/,
  'below-threshold releases must record the exemption reason');
assert.match(read('functions/src/index.ts'), /TAX_WITHHOLDING_THRESHOLD/,
  'functions escrow must enforce the same threshold');
const profileEdit = read('src/app/(teacher)/profile/edit/page.tsx');
assert.match(profileEdit, /tax_postcode/,
  'teacher profile must collect split tax address fields');

console.log('Security hardening regression checks passed');
