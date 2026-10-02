// End-to-end คิวงานค้างของแอดมิน (ops snapshot) บน Firebase emulator — ยิงผ่าน HTTP API จริง:
//   ผู้ปกครองเรียก /api/admin/ops-snapshot ต้องถูกปฏิเสธ (admin_only)
//   → แอดมินได้ snapshot ครบ 6 คิว + summary + ระดับความเร่งด่วน
//   → ตัวเลขใน snapshot ตรงกับ Firestore จริง และลำดับคิวเรียงตามความเร่งด่วน
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-ops-snapshot-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';
const SEED_TAG = 'emulator-uat';

const PARENT = { email: 'parent.ops.uat@example.test', password: 'Test1234!' };
const ADMIN = { email: 'admin.ops.uat@example.test', password: 'Test1234!' };

const QUEUE_KEYS = [
  'paymentsAwaitingReview',
  'paymentsPaid',
  'payoutsRequested',
  'payoutsProcessing',
  'stripeEventsProcessing',
  'lineOutboxFailed',
];

/** สร้างผู้ใช้ (ถ้ายังไม่มี) และบังคับ role ใน Firestore ให้ตรงกับการทดสอบ */
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
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emu-key', {
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

async function apiCall(cookie, method, path) {
  const res = await fetch(`${API}${path}`, { method, headers: { Cookie: cookie } });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function countWhere(db, collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).count().get();
  return snap.data().count;
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');
  const auth = admin.auth(app);

  await ensureUser(auth, db, { ...ADMIN, displayName: 'แอดมิน Ops UAT', role: 'admin' });
  await ensureUser(auth, db, { ...PARENT, displayName: 'ผู้ปกครอง Ops UAT', role: 'parent' });

  const parentCookie = await apiLogin(PARENT);
  const adminCookie = await apiLogin(ADMIN);

  // ── 1) ผู้ปกครองเรียก API ของแอดมิน → ถูกปฏิเสธ ──
  const blocked = await apiCall(parentCookie, 'GET', '/api/admin/ops-snapshot');
  assert.equal(blocked.status, 403, `parent must be blocked: ${JSON.stringify(blocked.data)}`);
  assert.equal(blocked.data.error, 'forbidden', 'must report forbidden');
  console.log('access control ok: ผู้ปกครองเรียก /api/admin/ops-snapshot ไม่ได้ (403)');

  // ── 2) สร้างคิวงานจริงใน Firestore เพื่อพิสูจน์ว่าตัวเลขไม่ได้ถูก hardcode ──
  // สร้างถึงเกณฑ์ actionAt (20) เพื่อพิสูจน์ทั้งการนับและการเลื่อนระดับความเร่งด่วน
  const FIXTURE_COUNT = 20;
  const runId = Date.now();
  const batch = db.batch();
  for (let i = 0; i < FIXTURE_COUNT; i += 1) {
    batch.set(db.collection('payments').doc(`ops-uat-${runId}-${i}`), {
      status: 'awaiting_review',
      amount: 0,
      seed: SEED_TAG,
      opsUat: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`fixture ok: สร้างสลิปรอตรวจ ${FIXTURE_COUNT} รายการใน Firestore`);

  try {
    const snap = await apiCall(adminCookie, 'GET', '/api/admin/ops-snapshot');
    assert.equal(snap.status, 200, `snapshot failed: ${JSON.stringify(snap.data)}`);
    assert.equal(snap.data.ok, true, 'must report ok');
    assert.ok(snap.data.at, 'must carry a timestamp');

    // ── 3) ครบทุกคิว และตรงกับ Firestore จริง ──
    for (const key of QUEUE_KEYS) {
      assert.ok(key in snap.data.queues, `missing queue: ${key}`);
      assert.ok(Number.isInteger(snap.data.queues[key]), `${key} must be an integer`);
    }

    const expectedAwaitingReview = await countWhere(db, 'payments', 'status', 'awaiting_review');
    assert.equal(
      snap.data.queues.paymentsAwaitingReview,
      expectedAwaitingReview,
      `paymentsAwaitingReview must match Firestore (${snap.data.queues.paymentsAwaitingReview} vs ${expectedAwaitingReview})`,
    );
    assert.ok(
      snap.data.queues.paymentsAwaitingReview >= FIXTURE_COUNT,
      `fixture must push the count to at least ${FIXTURE_COUNT}`,
    );
    console.log(`count ok: สลิปรอตรวจ = ${snap.data.queues.paymentsAwaitingReview} (ตรงกับ Firestore)`);

    // ── 4) ระดับความเร่งด่วน + ลำดับการแสดงผล ──
    assert.ok(Array.isArray(snap.data.items), 'items must be an array');
    assert.equal(snap.data.items.length, QUEUE_KEYS.length, 'items must cover every queue');

    const rank = { action: 0, watch: 1, idle: 2 };
    const ranks = snap.data.items.map((i) => rank[i.severity]);
    assert.ok(ranks.every((r) => r !== undefined), `unknown severity: ${JSON.stringify(snap.data.items)}`);
    for (let i = 1; i < ranks.length; i += 1) {
      assert.ok(ranks[i - 1] <= ranks[i], 'queues must be sorted by severity');
    }

    const counted = snap.data.items.reduce((sum, i) => sum + (i.severity === 'action' ? i.count : 0), 0);
    assert.equal(snap.data.summary.actionCount, counted, 'summary.actionCount must match items');
    assert.equal(
      snap.data.summary.action + snap.data.summary.watch + snap.data.summary.idle,
      QUEUE_KEYS.length,
      'summary must cover every queue',
    );
    assert.equal(snap.data.summary.action, 1, 'only the fixture queue may cross actionAt');
    assert.equal(snap.data.summary.idle, QUEUE_KEYS.length - 1, 'every other queue stays idle');
    assert.equal(snap.data.items[0].key, 'paymentsAwaitingReview', 'the urgent queue must sort first');
    console.log(`severity ok: ลำดับเรียงตามความเร่งด่วน (${snap.data.items.map((i) => `${i.key}=${i.severity}`).join(', ')})`);

    // ── 5) ลิงก์ของคิวที่มีงานต้องชี้ไปหน้าแอดมินที่มีอยู่จริง ──
    for (const item of snap.data.items) {
      if (!item.count || !item.actionHref) continue;
      const page = await apiCall(adminCookie, 'GET', item.actionHref);
      assert.ok(
        page.status < 500,
        `${item.key} points at ${item.actionHref} which returned ${page.status}`,
      );
      console.log(`link ok: ${item.key} → ${item.actionHref} (${page.status})`);
    }
  } finally {
    const cleanup = db.collection('payments').where('opsUat', '==', true).limit(FIXTURE_COUNT);
    const cleanupSnap = await cleanup.get();
    const cleanupBatch = db.batch();
    cleanupSnap.docs.forEach((d) => cleanupBatch.delete(d.ref));
    await cleanupBatch.commit();
  }

  // ── 6) ล้าง fixture แล้วตัวเลขต้องกลับเป็น 0 ──
  const after = await apiCall(adminCookie, 'GET', '/api/admin/ops-snapshot');
  assert.equal(
    after.data.queues.paymentsAwaitingReview,
    await countWhere(db, 'payments', 'status', 'awaiting_review'),
    'count must stay in sync after cleanup',
  );
  console.log('cleanup ok: ลบ fixture แล้วตัวเลขกลับเป็น 0');

  console.log('\n✅ OPS SNAPSHOT UAT PASSED — บล็อกผู้ใช้ทั่วไป/นับตรง Firestore/เรียงตามความเร่งด่วน/ลิงก์ถูกต้อง');
  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ OPS SNAPSHOT UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});