// E2E หลักฐานการโอนให้ครู (Firebase emulator + dev server จริง ทั้งหมดผ่าน HTTP API)
//
//   แอดมินอัปโหลดสลิป (POST /api/admin/payout-slip)
//     → path ที่ได้ต้องอยู่ใต้ payout-slips/{payoutId}/
//   จำลองฟอร์มบันทึกสถานะ (เก็บ slipPath ลง Firestore)
//     → แอดมินเปิดสลิปได้   → 307 ไปยัง Storage
//     → ครูเจ้าของ payout เปิดได้ → 307
//     → ผู้ใช้อื่น → 403
//     → ไม่ล็อกอิน → 401
//     → payout ที่ยังไม่มีสลิป → 404
//
// Run (ต้องเปิด emulator + dev server ก่อน หรือใช้ pnpm uat):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-admin-payout-slip-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';
const AUTH_API = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

const ADMIN = { email: 'admin.slip.uat@example.test', password: 'Test1234!' };
const TEACHER = { email: 'teacher.slip.uat@example.test', password: 'Test1234!' };
const OUTSIDER = { email: 'parent.slip.uat@example.test', password: 'Test1234!' };

// PNG 1x1 ใส ใช้แทนสลิป
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function ensureUser(auth, db, { email, displayName, role }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: 'Test1234!', displayName, emailVerified: true });
  }
  const { FieldValue } = require('firebase-admin/firestore');
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email,
    displayName,
    role,
    emailVerified: true,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return user.uid;
}

async function apiLogin(account) {
  const res = await fetch(`${AUTH_API}/accounts:signInWithPassword?key=emu-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  const data = await res.json().catch(() => ({}));
  assert.ok(data.idToken, `login failed for ${account.email}: ${JSON.stringify(data).slice(0, 200)}`);
  const session = await fetch(`${API}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: data.idToken }),
  });
  assert.ok(session.ok, `session cookie failed: ${session.status}`);
  return (session.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
}

function uploadSlip(cookie, payoutId) {
  const form = new FormData();
  form.append('payoutId', payoutId);
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'slip.png');
  return fetch(`${API}/api/admin/payout-slip`, { method: 'POST', headers: { Cookie: cookie }, body: form });
}

async function openSlip(cookie, payoutId) {
  return fetch(`${API}/api/payouts/${payoutId}/slip`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const auth = admin.auth(app);
  const db = getFirestore(app, 'tutor');

  const adminUid = await ensureUser(auth, db, { ...ADMIN, displayName: 'แอดมิน UAT', role: 'admin' });
  const teacherUid = await ensureUser(auth, db, { ...TEACHER, displayName: 'ครู UAT', role: 'teacher' });
  await ensureUser(auth, db, { ...OUTSIDER, displayName: 'ผู้ปกครองอื่น UAT', role: 'parent' });

  const payoutRef = db.collection('payouts').doc();
  await payoutRef.set({
    teacherId: teacherUid,
    amount: 1200,
    status: 'requested',
    bankName: 'กรุงเทพ',
    accountName: 'ครู UAT',
    accountNumber: '000-000-0000',
    createdAt: FieldValue.serverTimestamp(),
  });
  const payoutId = payoutRef.id;

  const adminCookie = await apiLogin(ADMIN);
  const teacherCookie = await apiLogin(TEACHER);
  const outsiderCookie = await apiLogin(OUTSIDER);

  try {
    // ── แอดมินอัปโหลดสลิปได้ (เคยติดข้อความ "เข้าสู่ระบบด้วยบัญชีของครูเจ้าของโปรไฟล์") ──
    const uploadRes = await uploadSlip(adminCookie, payoutId);
    assert.equal(uploadRes.status, 200, `admin slip upload must succeed, got ${uploadRes.status}`);
    const uploaded = await uploadRes.json();
    assert.ok(uploaded.url, 'upload must return a preview url');
    assert.ok(uploaded.path, 'upload must return the storage path');
    assert.ok(
      uploaded.path.startsWith(`payout-slips/${payoutId}/`),
      `slip path must be scoped to the payout, got ${uploaded.path}`,
    );
    console.log(`upload ok: ${uploaded.path}`);

    // ── บันทึกสถานะแบบที่ฟอร์มทำ (เก็บ path ไม่เก็บ URL ที่หมดอายุ) ──
    await payoutRef.update({ slipPath: uploaded.path, status: 'paid', paidAt: FieldValue.serverTimestamp() });

    const adminView = await openSlip(adminCookie, payoutId);
    assert.equal(adminView.status, 307, `admin must be redirected to the file, got ${adminView.status}`);
    assert.ok(
      (adminView.headers.get('location') || '').includes('payout-slips'),
      'admin redirect must point at the stored slip',
    );
    console.log('admin view ok: 307 → storage');

    const teacherView = await openSlip(teacherCookie, payoutId);
    assert.equal(teacherView.status, 307, `the teacher who owns the payout must be able to open it, got ${teacherView.status}`);
    console.log('teacher view ok: 307 → storage');

    const outsiderView = await openSlip(outsiderCookie, payoutId);
    assert.equal(outsiderView.status, 403, `another user must not read the slip, got ${outsiderView.status}`);
    console.log('outsider blocked ok: 403');

    const anonView = await openSlip(null, payoutId);
    assert.equal(anonView.status, 401, `anonymous access must be rejected, got ${anonView.status}`);
    console.log('anonymous blocked ok: 401');

    const outsiderUpload = await uploadSlip(outsiderCookie, payoutId);
    assert.equal(outsiderUpload.status, 403, `only admins may upload slips, got ${outsiderUpload.status}`);
    console.log('non-admin upload blocked ok: 403');

    // ── payout ที่ยังไม่มีสลิป ต้องไม่หลุดข้อมูลอะไรออกมา ──
    const emptyRef = db.collection('payouts').doc();
    await emptyRef.set({
      teacherId: teacherUid,
      amount: 300,
      status: 'requested',
      bankName: 'กรุงเทพ',
      accountName: 'ครู UAT',
      accountNumber: '111-111-1111',
      createdAt: FieldValue.serverTimestamp(),
    });
    const emptyView = await openSlip(adminCookie, emptyRef.id);
    assert.equal(emptyView.status, 404, `a payout without a slip must 404, got ${emptyView.status}`);
    console.log('missing slip ok: 404');
    await emptyRef.delete();
  } finally {
    await payoutRef.delete();
  }

  console.log('\n✅ ADMIN PAYOUT SLIP UAT PASSED — แอดมินอัปโหลดได้, เก็บเป็น path, ครูเจ้าของเปิดได้, คนอื่นถูกบล็อก');
}

main().catch((error) => {
  console.error('\nADMIN PAYOUT SLIP UAT FAILED —', error);
  process.exitCode = 1;
});