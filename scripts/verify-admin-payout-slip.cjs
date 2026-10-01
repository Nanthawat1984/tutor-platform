// ตรวจว่า flow หลักฐานการโอนให้ครู (admin แนบสลิป → ครูเปิดดู) ถูกต้อง
//
// เคยพังสองจุด บั๊กนี้คือด่านกันไม่ให้กลับมา:
//   1. KycFileUploader เช็คว่าผู้อัปโหลดตรงกับ uid เจ้าของโปรไฟล์ — บนหน้า
//      /admin/payouts ค่า uid ที่ส่งเข้าไปคือ id ของ payout ไม่ใช่ uid ครู
//      ทำให้แอดมินถูกบังคับให้ "เข้าสู่ระบบด้วยบัญชีของครูเจ้าของโปรไฟล์"
//      และอัปโหลดสลิปไม่ได้เลย
//   2. สลิปถูกเก็บเป็น signed URL อายุ 7 วัน แล้วลิงก์ตรง ๆ — ครูเปิดหลักฐานที่
//      หน้ารายได้ได้เฉพาะใน 7 วันแรก หลังจากนั้นลิงก์ตายทั้งที่ notification
//      สั่งให้มาดูสลิปตรงนั้น
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const uploader = read('src/components/teacher/kyc-file-uploader.tsx');
const adminPayouts = read('src/app/admin/payouts/page.tsx');
const teacherEarnings = read('src/app/(teacher)/earnings/page.tsx');
const uploadRoute = read('src/app/api/admin/payout-slip/route.ts');
const slipRule = read('src/lib/payout-slip.ts');
const types = read('src/types/firestore.ts');
const middleware = read('src/middleware.ts');
const useFirebase = read('src/hooks/useFirebase.tsx');
const taxReport = read('src/app/admin/tax-report/page.tsx');

// ── 1. แอดมินอัปโหลดสลิปได้ ────────────────────────────────────────
assert.match(uploader, /const ADMIN_API_FOLDER = 'payout-slips'/,
  'admin upload folder must be a named constant so the guard and the API branch cannot drift');
assert.match(uploader, /const usesAdminApi = folder === ADMIN_API_FOLDER/,
  'the admin API path must be derived from that constant');
assert.match(uploader, /const authMismatch = !usesAdminApi && authReady/,
  'the owner check must be skipped on the admin API path (payout id is not a user id)');

assert.match(uploader, /name="slipPath"/,
  'the uploader must hand the Storage path back to the admin form, not just a signed URL');
assert.match(uploadRoute, /return NextResponse\.json\(\{ url, path \}\)/,
  'the upload route must return the Storage path alongside the preview URL');
assert.match(uploadRoute, /requireAdmin\(\)/,
  'payout slip upload must stay admin-only on the server');

// ── 2. หลักฐานต้องอยู่ได้ ไม่ใช่ URL ที่หมดอายุ ───────────────────────
assert.match(types, /slipPath\?: string/,
  'payouts must model the stored slip path');
assert.match(adminPayouts, /updates\.slipPath = slipPath/,
  'the admin form must persist the slip path');

assert.ok(exists('src/app/api/payouts/[id]/slip/route.ts'),
  'a route that serves payout slips on demand must exist');
const slipRoute = read('src/app/api/payouts/[id]/slip/route.ts');
assert.match(slipRoute, /payout\.teacherId !== session\.uid/,
  'payout slips must be limited to admins and the teacher who owns the payout');
assert.match(slipRoute, /payout-slips\/\$\{id\}\//,
  'the slip path must be scoped to its own payout id');
assert.doesNotMatch(slipRoute, /7 \* 24 \* 60 \* 60 \* 1000/,
  'signed slip URLs must be short-lived; a 7-day URL is what broke the teacher link');

assert.match(adminPayouts, /href=\{`\/api\/payouts\/\$\{p\.id\}\/slip`\}/,
  'the admin page must open slips through the authenticated route');
assert.match(teacherEarnings, /href=\{`\/api\/payouts\/\$\{p\.id\}\/slip`\}/,
  'the teacher earnings page must open slips through the authenticated route');
assert.doesNotMatch(adminPayouts, /href=\{p\.slipURL\}/,
  'the admin page must not link a stored signed URL directly');
assert.doesNotMatch(teacherEarnings, /href=\{p\.slipURL\}/,
  'the teacher earnings page must not link a stored signed URL directly');

// ── 3. ปิดรายการเป็น "โอนแล้ว" ต้องมีหลักฐาน ──────────────────────────
assert.match(adminPayouts, /isSlipRequiredForPaid\(\{/,
  'the payouts action must go through the slip rule');
assert.doesNotMatch(adminPayouts, /กรุณาเข้าสู่ระบบด้วยบัญชีของครูเจ้าของโปรไฟล์/,
  'the teacher sign-in prompt must not leak into the admin payouts flow');
assert.match(slipRule, /if \(input\.useConnect\) return false/,
  'Stripe Connect transfers carry a transfer id, so no slip is required');
assert.doesNotMatch(slipRule, /slipURL/,
  'the slip rule must reason about the stored slip reference, not an expiring URL');

// ── 4. ลิงก์ชื่อครูจากฝั่งแอดมินต้องได้หน้าที่แอดมินเปิดได้ ──────────
assert.doesNotMatch(adminPayouts, /href=\{`\/teachers\//,
  'admin payouts must not link to the parent-only /teachers/{id} route');
assert.doesNotMatch(taxReport, /href=\{`\/teachers\//,
  'admin tax report must not link to the parent-only /teachers/{id} route');
assert.match(adminPayouts, /href=\{`\/admin\/teachers\/\$\{p\.teacherId\}`\}/,
  'admin payouts must link to the admin teacher record');
assert.match(taxReport, /href=\{`\/admin\/teachers\/\$\{r\.teacherId\}`\}/,
  'admin tax report must link to the admin teacher record');

// ── 5. เซสชันไม่หลุดเงียบ ๆ หลังพ้นอายุ token ──────────────────────────
assert.match(useFirebase, /onIdTokenChanged\(/,
  'the __session cookie must be refreshed when Firebase rotates the ID token');
assert.match(useFirebase, /idToken === lastSessionToken/,
  'token refresh must skip the POST when the token has not actually changed');

assert.doesNotMatch(middleware, /'\/teachers\/',/,
  "PROTECTED_ROUTES must not keep the '/teachers/' entry that pathname.startsWith(route + '/') can never match");

console.log('✅ admin payout slip verify passed — อัปโหลดได้, เก็บเป็น path, เปิดดูผ่าน route ที่ยังได้, ปิดโอนแล้วต้องมีหลักฐาน');