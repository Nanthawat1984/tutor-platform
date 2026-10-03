// E2E: login → profile setup contract (Firebase emulator + dev server จริง)
//
// ป้องกันบั๊กที่ทำให้ผู้ใช้ "ล็อกอินไม่ได้" ถาวร: บัญชีที่ยืนยันตัวตนผ่าน Firebase Auth สำเร็จ
// แต่ไม่มีเอกสารใน Firestore ต้องถูกพาไปกรอกบทบาท + ยอมรับข้อตกลง ไม่ใช่ถูกปฏิเสธเงียบ ๆ
//
//   1) สร้าง Auth user ที่ "ไม่มี" users doc  (จำลองบัญชีที่ doc หาย/ไม่ถูก migrate)
//   2) ล็อกอิน → POST /api/auth/session ได้คุกกี้ (middleware ปล่อยผ่าน)
//   3) GET /api/auth/profile → 404 user:null      (หน้า login ต้องแสดงขั้นตอนกรอกข้อมูล)
//   4) POST /api/auth/profile ไม่มี consent → 400 consent_required  (กำแดง consent gate)
//   5) POST ฉบับเก่า → 400 consent_required      (เวอร์ชันข้อตกลงต้องตรงปัจจุบัน)
//   6) POST พร้อม consent → 200 created:true + role ถูกต้อง
//   7) GET อีกครั้ง → 200 ได้โปรไฟล์ และ POST ซ้ำ → created:false (idempotent)
//   8) cleanup ทิ้งทั้ง doc และ Auth user
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-profile-setup-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';

const ACCOUNT = { email: 'orphaned.uat@example.test', password: 'Test1234!' };

// ต้องตรงกับ src/lib/legal/consent.ts — ถ้าเวอร์ชันข้อตกลงเปลี่ยน ให้แก้ที่นี่ด้วย
const TERMS_VERSION = '2026-08-21-v1';
const PRIVACY_VERSION = '2026-08-21-v1';

// /api/auth/profile ตรวจสิทธิ์ด้วย Bearer token (ไม่ได้อ่านคุกกี้)
// /api/auth/session ตรวจสิทธิ์ด้วย idToken ใน body
async function apiCall({ token, cookie }, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');

  // ── 1) Auth user ที่ไม่มี users doc ────────────────────────
  let authUser;
  try {
    await admin.auth(app).deleteUserByEmail(ACCOUNT.email);
  } catch { /* ยังไม่มีในระบบ */ }
  authUser = await admin.auth(app).createUser({
    email: ACCOUNT.email,
    password: ACCOUNT.password,
    displayName: 'UAT Orphaned Parent',
    emailVerified: true,
  });
  const userRef = db.collection('users').doc(authUser.uid);
  assert.equal((await userRef.get()).exists, false, 'fixture ต้องเริ่มจาก ' +
    'ไม่มี users doc (จำลองบัญชีที่หายไปหลังย้ายฐานข้อมูล)');
  console.log(`fixture ok: ${ACCOUNT.email} uid=${authUser.uid} (ไม่มี users doc)`);

  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emu-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password, returnSecureToken: true }),
  });
  const signIn = await res.json().catch(() => ({}));
  assert.ok(signIn.idToken, `login failed: ${JSON.stringify(signIn).slice(0, 200)}`);
  const idToken = signIn.idToken;
  console.log('login ok: ได้ idToken จาก Auth emulator');

  try {
    // ── 2) session cookie ───────────────────────────────────
    const session = await apiCall({}, 'POST', '/api/auth/session', { idToken });
    assert.equal(session.status, 200, `session ต้องสำเร็จแม้ยังไม่มีโปรไฟล์: ${JSON.stringify(session.data)}`);
    const cookie = (session.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
    assert.ok(cookie.includes('__session='), 'ต้องได้คุกกี้ __session');
    console.log('session ok: ได้คุกกี้ __session (middleware ปล่อยผ่านแล้ว)');

    // ── 3) โปรไฟล์ยังไม่มี → ต้องบอกให้ UI พาไปกรอกข้อมูล ──
    const before = await apiCall({ token: idToken }, 'GET', '/api/auth/profile');
    assert.equal(before.status, 404, `คาด 404 ตอนยังไม่มีโปรไฟล์ แต่ได้ ${before.status}`);
    assert.equal(before.data.user, null, 'ต้องคืน user:null ไม่ใช่ error');
    console.log('read ok: 404 user:null → needsProfileSetup = true');

    // ── 4) ห้ามสร้างโปรไฟล์โดยไม่มี consent ──────────────────
    const noConsent = await apiCall({ token: idToken }, 'POST', '/api/auth/profile', { role: 'parent' });
    assert.equal(noConsent.status, 400, `ต้องตอบ 400 เมื่อไม่มี consent แต่ได้ ${noConsent.status}`);
    assert.equal(noConsent.data.error, 'consent_required', `ต้องเป็น consent_required: ${JSON.stringify(noConsent.data)}`);
    assert.equal((await userRef.get()).exists, false, 'ต้องไม่สร้าง doc เมื่อไม่มี consent');
    console.log('consent gate ok: ไม่มี consent → 400 consent_required และไม่สร้าง doc');

    // ── 5) ข้อตกลงฉบับเก่าต้องถูกปฏิเสธเหมือนกัน ────────────────
    const staleConsent = await apiCall({ token: idToken }, 'POST', '/api/auth/profile', {
      role: 'parent',
      consent: { termsVersion: 'stale-version', privacyVersion: 'stale-version' },
    });
    assert.equal(staleConsent.status, 400, 'consent ฉบับเก่าต้องถูกปฏิเสธ');
    assert.equal(staleConsent.data.error, 'consent_required', 'ต้องเป็น consent_required');
    console.log('stale consent ok: ข้อตกลงฉบับเก่า → 400 consent_required');

    // ── 6) ยอมรับข้อตกลงแล้วสร้างโปรไฟล์ได้ ──────────────────
    const created = await apiCall({ token: idToken }, 'POST', '/api/auth/profile', {
      role: 'parent',
      displayName: 'UAT Orphaned Parent',
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });
    assert.equal(created.status, 200, `สร้างโปรไฟล์ต้องสำเร็จ: ${JSON.stringify(created.data)}`);
    assert.equal(created.data.created, true, 'ต้องรายงาน created:true');
    assert.equal(created.data.user.role, 'parent', 'role ต้องเป็นที่ผู้ใช้เลือก');
    assert.equal(created.data.user.termsVersion, TERMS_VERSION, 'ต้องบันทึก termsVersion');
    console.log('create ok: สร้าง users doc พร้อม role + termsVersion');

    // ── 7) อ่านกลับได้ และซ้ำไม่สร้างใหม่ ────────────────────
    const after = await apiCall({ token: idToken }, 'GET', '/api/auth/profile');
    assert.equal(after.status, 200, 'ต้องอ่านโปรไฟล์ที่สร้างแล้วได้');
    assert.equal(after.data.user.uid, authUser.uid, 'uid ต้องตรงกับ Auth user');
    const repeat = await apiCall({ token: idToken }, 'POST', '/api/auth/profile', {
      role: 'teacher',
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });
    assert.equal(repeat.status, 200, 'ซ้ำต้องสำเร็จ');
    assert.equal(repeat.data.created, false, 'ซ้ำต้องไม่สร้างใหม่');
    assert.equal(repeat.data.user.role, 'parent', 'ซ้ำต้องไม่ทับบทบาทเดิม');
    console.log('idempotent ok: อ่านกลับได้ และซ้ำไม่ทับ role เดิม');
  } finally {
    // ── 8) cleanup ──────────────────────────────────────────
    await userRef.delete().catch(() => {});
    await admin.auth(app).deleteUser(authUser.uid).catch(() => {});
    console.log('cleanup ok: ลบ users doc + Auth user แล้ว');
    await app.delete();
  }

  console.log('\n✅ PROFILE SETUP UAT PASSED — ล็อกอินได้→ไม่มีโปรไฟล์→consent gate บล็อกการสร้างอัตโนมัติ→ยอมรับแล้วสร้างได้→ซ้ำไม่ทับ');
}

main().catch((err) => {
  console.error('\n❌ PROFILE SETUP UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});