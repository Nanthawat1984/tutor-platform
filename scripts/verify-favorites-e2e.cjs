// End-to-end รายการโปรดครู (favorites) บน Firebase emulator — ยิงผ่าน HTTP API จริง:
//   ผู้ปกครองกดหัวใจครู → GET /api/favorites ต้องเห็น → กดซ้ำต้องไม่ซ้ำ (idempotent)
//   → เอาออกแล้วหายจากรายการ → ครูเรียกเองต้องถูกปฏิเสธ (parents_only)
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-favorites-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';
const SEED_TAG = 'emulator-uat';

const PARENT = { email: 'parent.uat@example.test', password: 'Test1234!' };
const TEACHER = { email: 'teacher.uat@example.test', password: 'Test1234!' };

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

async function apiCall(cookie, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Cookie: cookie } : { Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');

  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  const teacherId = coursesSnap.docs[0].data().teacherId;

  const parentCookie = await apiLogin(PARENT);
  const teacherCookie = await apiLogin(TEACHER);

  // ── 1) ล้างรายการเดิมของครูคนนี้ (รันซ้ำได้) ──
  const cleanup = await db.collection('parentFavorites')
    .where('teacherId', '==', teacherId).get();
  if (!cleanup.empty) {
    const batch = db.batch();
    cleanup.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // ── 2) ครูเรียก API ของผู้ปกครอง → ถูกปฏิเสธ ──
  const teacherBlocked = await apiCall(teacherCookie, 'GET', '/api/favorites');
  assert.equal(teacherBlocked.status, 403, `teacher must be blocked: ${JSON.stringify(teacherBlocked.data)}`);
  assert.equal(teacherBlocked.data.error, 'parents_only', 'must report parents_only');
  console.log('access control ok: ครูเรียก /api/favorites ไม่ได้ (parents_only)');

  // ── 3) เพิ่มครูในรายการโปรด ──
  const before = await apiCall(parentCookie, 'GET', '/api/favorites');
  assert.equal(before.status, 200, `list failed: ${JSON.stringify(before.data)}`);
  const beforeCount = before.data.items.length;

  const add = await apiCall(parentCookie, 'POST', '/api/favorites', { teacherId, favorite: true });
  assert.equal(add.status, 200, `add favorite failed: ${JSON.stringify(add.data)}`);
  assert.equal(add.data.favorite, true, 'favorite must be true');

  const afterAdd = await apiCall(parentCookie, 'GET', '/api/favorites');
  assert.equal(afterAdd.data.items.length, beforeCount + 1, 'list must grow by 1');
  const saved = afterAdd.data.items.find((i) => i.teacherId === teacherId);
  assert.ok(saved, 'saved teacher must appear in the list');
  assert.ok(saved.createdAt, 'saved entry must carry createdAt');
  console.log(`add ok: ${saved.teacherName || teacherId} อยู่ในรายการโปรด`);

  // ── 4) กดซ้ำต้องไม่ซ้ำ (doc id deterministic) ──
  await apiCall(parentCookie, 'POST', '/api/favorites', { teacherId, favorite: true });
  const afterDup = await apiCall(parentCookie, 'GET', '/api/favorites');
  assert.equal(
    afterDup.data.items.filter((i) => i.teacherId === teacherId).length,
    1,
    'pressing twice must not create duplicates',
  );
  console.log('idempotency ok: กดซ้ำไม่สร้างรายการซ้ำ');

  // ── 5) เอาออก ──
  const remove = await apiCall(parentCookie, 'POST', '/api/favorites', { teacherId, favorite: false });
  assert.equal(remove.status, 200, `remove failed: ${JSON.stringify(remove.data)}`);
  assert.equal(remove.data.favorite, false, 'favorite must be false');
  const afterRemove = await apiCall(parentCookie, 'GET', '/api/favorites');
  assert.ok(
    !afterRemove.data.items.some((i) => i.teacherId === teacherId),
    'removed teacher must disappear from the list',
  );

  // เอาออกซ้ำต้องไม่ error (idempotent ฝั่งลบด้วย)
  const removeAgain = await apiCall(parentCookie, 'POST', '/api/favorites', { teacherId, favorite: false });
  assert.equal(removeAgain.status, 200, 'removing a non-existent favorite must not fail');
  console.log('remove ok: เอาออกแล้วหายจากรายการ + ลบซ้ำไม่พัง');

  // ── 6) teacherId ที่ไม่มีจริง → 404 ──
  const notFound = await apiCall(parentCookie, 'POST', '/api/favorites', { teacherId: 'uat-not-a-teacher' });
  assert.equal(notFound.status, 404, `unknown teacher must 404: ${JSON.stringify(notFound.data)}`);
  assert.equal(notFound.data.error, 'teacher_not_found', 'must report teacher_not_found');
  console.log('validation ok: teacherId ไม่มีจริง → 404');

  console.log('\n✅ FAVORITES UAT PASSED — เพิ่ม/กดซ้ำไม่ซ้ำ/เอาออก/บล็อกครู/ตรวจ teacherId');
  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ FAVORITES UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});