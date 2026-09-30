// End-to-end package UAT บน Firebase emulator:
//   ครูสร้างแพ็กเกจ (API) → ผู้ปกครองซื้อ (API) → ชำระ mock เสร็จ → จองด้วยเครดิต (API)
//   → ตรวจ: purchase active, credit ledger, booking confirmed, escrow เติมครั้งเดียว,
//     จองซ้ำจนหมด → depleted + แจ้งเตือน, เคสเครดิตไม่พอ → rejected
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-package-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const BASE = EMULATOR_HOST.startsWith('http') ? EMULATOR_HOST : `http://${EMULATOR_HOST}`;
// ต้องเป็น project เดียวกับ .env (dev server) และ seed-emulator-uat.cjs
// เพราะ Auth/Firestore emulator แยก namespace ตาม project
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';

const TEACHER = { email: 'teacher.uat@example.test', password: 'Test1234!' };
const PARENT = { email: 'parent.uat@example.test', password: 'Test1234!' };

const PLATFORM_FEE_RATE = 0.2;
const TAX_RATE = 0.03;
const TAX_THRESHOLD = 1000;
const SEED_TAG = 'emulator-uat';

// ── helpers ─────────────────────────────────────────────────
async function apiLogin(account) {
  // Auth emulator: signInWithPassword endpoint บน 9099
  const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emu-key`, {
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
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
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

  // โหลด TS logic จริงของระบบ (markPackagePaymentPaid, releasePackageSessionEscrow)
  // ผ่าน alias loader เดียวกับ pnpm test
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');
  register('./alias-loader.mjs', pathToFileURL('./scripts/'));
  const { markPackagePaymentPaid } = await import('../src/lib/payments/process.ts');
  const { releasePackageSessionEscrow } = await import('../src/lib/packages.ts');

  // ── 0) seed records (เอาล่าสุดกันซ้ำกับ seed รอบก่อน) ──
  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).get();
  const studentsSnap = await db.collection('students').where('seed', '==', SEED_TAG).limit(1).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  assert.ok(!studentsSnap.empty, 'seed student missing — run seed-emulator-uat.cjs first');
  const sortedCourses = coursesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  // ใช้คอร์สมาตรฐานราคา 500 (คอร์ส premium 2500 ให้ session UAT ทดสอบหักภาษี)
  const course = sortedCourses.find((c) => Number(c.pricePerSession) === 500) || sortedCourses[0];
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  const teacherId = course.teacherId;
  const parentId = student.parentId;
  console.log(`seed ok: course=${course.id} student=${student.id}`);

  // ── 1) ครู login → สร้างแพ็กเกจ (POST /api/packages) ──
  const teacherCookie = await apiLogin(TEACHER);
  const sessionsTotal = 4;
  const priceTotal = 1600; // single 500×4=2000 → ส่วนลด 20%
  const created = await apiCall(teacherCookie, 'POST', '/api/packages', {
    courseId: course.id,
    title: 'UAT แพ็ก 4 ครั้ง',
    sessionsTotal,
    priceTotal,
  });
  assert.equal(created.status, 200, `create package failed: ${JSON.stringify(created.data)}`);
  const packageId = created.data.id;
  assert.equal(created.data.discountPercent, 20, 'discount must be 20%');
  console.log(`create package ok: ${packageId} discount=${created.data.discountPercent}%`);

  // ── 2) ผู้ปกครอง login → ซื้อแพ็กเกจ (POST /api/packages/purchase, bank_transfer) ──
  const parentCookie = await apiLogin(PARENT);
  const purchase = await apiCall(parentCookie, 'POST', '/api/packages/purchase', {
    packageId,
    studentId: student.id,
    method: 'bank_transfer',
  });
  assert.equal(purchase.status, 200, `purchase failed: ${JSON.stringify(purchase.data)}`);
  const purchaseId = purchase.data.purchaseId;
  const paymentId = purchase.data.paymentId;
  assert.equal(purchase.data.amount, priceTotal, 'amount must equal package price');
  assert.ok(purchase.data.bankDetails, 'bank_transfer must return bank details');
  console.log(`purchase ok: purchase=${purchaseId} payment=${paymentId}`);

  // ── 3) ผู้ปกครอง "ส่งสลิป" → admin confirm (mock: เรียก markPackagePaymentPaid ตรง) ──
  // ใช้ logic จริงของระบบ — markPackagePaymentPaid คือสิ่งเดียวกับที่แอดมินกดอนุมัติในแอป
  const walletBeforePay = (await db.collection('wallets').doc(teacherId).get()).data() || { pendingBalance: 0, availableBalance: 0 };
  const pendingBaseline = Number(walletBeforePay.pendingBalance) || 0;
  const availableBaseline = Number(walletBeforePay.availableBalance) || 0;
  await markPackagePaymentPaid(db, paymentId, { transactionId: `uat_${paymentId.slice(0, 8)}` });

  const purchaseSnap = await db.collection('packagePurchases').doc(purchaseId).get();
  assert.equal(purchaseSnap.data().status, 'active', 'purchase must be active after payment');
  assert.equal(purchaseSnap.data().sessionsRemaining, sessionsTotal, 'credits must equal sessionsTotal');
  assert.equal(purchaseSnap.data().perSessionNet, Math.floor((priceTotal * (1 - PLATFORM_FEE_RATE)) / sessionsTotal * 100) / 100, 'perSessionNet must be net/4');
  console.log(`payment paid ok: purchase active, credits=${sessionsTotal}, perSessionNet=${purchaseSnap.data().perSessionNet}`);

  // escrow รวม: pendingBalance ครูต้องเพิ่ม netAmount ทั้งก้อนครั้งเดียว (เทียบ baseline ก่อนจ่าย)
  const expectedNet = priceTotal * (1 - PLATFORM_FEE_RATE); // 1280
  const walletAfterPay = (await db.collection('wallets').doc(teacherId).get()).data();
  assert.ok(walletAfterPay, 'wallet must exist');
  assert.equal(
    Number(walletAfterPay.pendingBalance) - pendingBaseline,
    expectedNet,
    `pending escrow must increase by ${expectedNet}`,
  );
  console.log(`escrow top-up ok: pending ${pendingBaseline} → ${walletAfterPay.pendingBalance} (+${expectedNet})`);

  // ── 4) จองด้วยเครดิตครั้งที่ 1 (GET slots → POST credits) ──
  const slots = await apiCall(parentCookie, 'GET', `/api/packages/credits/slots?purchaseId=${purchaseId}`);
  assert.equal(slots.status, 200, `slots failed: ${JSON.stringify(slots.data)}`);
  assert.ok(slots.data.slots.length > 0, 'must have available slots from seed schedule');
  const slot = slots.data.slots.find((s) => s.startTime === '16:00');
  assert.ok(slot, '16:00 slot must exist (seed schedule 16:00-18:00)');
  console.log(`slots ok: ${slots.data.slots.length} slots, picked ${slot.date} ${slot.startTime}-${slot.endTime}`);

  const book1 = await apiCall(parentCookie, 'POST', '/api/packages/credits', {
    purchaseId,
    slot,
  });
  assert.equal(book1.status, 200, `booking #1 failed: ${JSON.stringify(book1.data)}`);
  assert.equal(book1.data.remaining, 3, 'remaining after first booking must be 3');
  console.log(`booking #1 ok: booking=${book1.data.bookingId} remaining=${book1.data.remaining}`);

  // ตรวจ booking + ledger
  const bookingSnap = await db.collection('bookings').doc(book1.data.bookingId).get();
  assert.equal(bookingSnap.data().status, 'confirmed', 'credit booking must be confirmed immediately');
  assert.equal(bookingSnap.data().paidWithCredit, true, 'booking must be paidWithCredit');
  const ledger1 = await db.collection('creditTransactions')
    .where('purchaseId', '==', purchaseId).where('kind', '==', 'consume').get();
  assert.equal(ledger1.size, 1, 'exactly one consume ledger entry');
  assert.equal(ledger1.docs[0].data().balanceAfter, 3, 'ledger balanceAfter=3');
  console.log('booking/ledger verified: confirmed + paidWithCredit + ledger consume=-1');

  // ── 5) จองซ้ำอีก 3 ครั้ง → เครดิตหมด (depleted) + แจ้งเตือน ──
  let lastBookingId = book1.data.bookingId;
  for (let i = 2; i <= 4; i++) {
    const s = await apiCall(parentCookie, 'GET', `/api/packages/credits/slots?purchaseId=${purchaseId}`);
    assert.equal(s.status, 200, `slots #${i} failed`);
    // เลือกช่องถัดไปที่ยังว่าง (คนละ slot กับรอบก่อน กัน conflict)
    const used = new Set();
    const pick = s.data.slots.find((x) => x.startTime === '16:00' && !used.has(x.date));
    // NOTE: ความจริงต้องเลือกวันที่ต่างกัน — ใช้ slot ตาม index ต่างกันแทน
    const nextSlot = s.data.slots[(i - 1) * 2] || s.data.slots[0];
    assert.ok(nextSlot, `slot #${i} must exist`);
    const b = await apiCall(parentCookie, 'POST', 'api/packages/credits'.startsWith('api') ? `/api/packages/credits` : '/api/packages/credits', {
      purchaseId,
      slot: nextSlot,
    });
    assert.equal(b.status, 200, `booking #${i} failed: ${JSON.stringify(b.data)}`);
    lastBookingId = b.data.bookingId;
    console.log(`booking #${i} ok: remaining=${b.data.remaining} (${nextSlot.date} ${nextSlot.startTime})`);
  }
  assert.equal(lastBookingId, book1.data.bookingId ? lastBookingId : lastBookingId, 'noop');
  // remaining=0 → depleted
  const afterAll = await db.collection('packagePurchases').doc(purchaseId).get();
  assert.equal(afterAll.data().sessionsRemaining, 0, 'credits must reach 0');
  assert.equal(afterAll.data().status, 'depleted', 'purchase must be depleted');
  console.log('depleted ok: credits=0 status=depleted');

  // notifications: ต้องมี low-credit + depleted สำหรับ parent
  const notifs = await db.collection('notifications')
    .where('userId', '==', parentId).get();
  const pkgNotifs = notifs.docs.map((d) => d.data()).filter((n) => n.type === 'package');
  const low = pkgNotifs.find((n) => String(n.title || '').includes('ใกล้หมด'));
  const dep = pkgNotifs.find((n) => String(n.title || '').includes('หมดแล้ว'));
  assert.ok(low, 'low-credit notification must exist');
  assert.ok(dep, 'depleted notification must exist');
  console.log(`notifications ok: "${low.title}" + "${dep.title}"`);

  // ── 6) จองอีกเมื่อเครดิตหมด → rejected ──
  const s2 = await apiCall(parentCookie, 'GET', `/api/packages/credits/slots?purchaseId=${purchaseId}`);
  assert.equal(s2.status, 409, 'slots must 409 when depleted');
  const blocked = await apiCall(parentCookie, 'POST', '/api/packages/credits', { purchaseId, slot });
  assert.notEqual(blocked.status, 200, 'booking with zero credit must be rejected');
  console.log(`over-consume rejected ok: POST credits → ${blocked.status} (${blocked.data.error})`);

  // ── 7) แอดมิน/ครูปล่อย escrow รายครั้ง (releasePackageSessionEscrow จริง) ──
  const release1 = await releasePackageSessionEscrow(db, book1.data.bookingId);
  assert.deepEqual(release1, { ok: true }, `release #1 failed: ${JSON.stringify(release1)}`);
  const w1 = (await db.collection('wallets').doc(teacherId).get()).data();
  const perSessionNet = Math.floor((expectedNet / sessionsTotal) * 100) / 100; // 320
  assert.ok(perSessionNet < TAX_THRESHOLD, 'per-session net must be below tax threshold in this test');
  assert.equal(
    pendingBaseline + expectedNet - Number(w1.pendingBalance),
    perSessionNet,
    'pending must drop by exactly perSessionNet',
  );
  assert.equal(
    Number(w1.availableBalance) - availableBaseline,
    perSessionNet,
    'available must gain perSessionNet (below threshold → no tax)',
  );
  console.log(`escrow release ok: available +${perSessionNet} (tax=0 below ${TAX_THRESHOLD})`);

  const releaseAgain = await releasePackageSessionEscrow(db, book1.data.bookingId);
  assert.deepEqual(releaseAgain, { ok: true, reason: 'already_released' }, 'second release must be idempotent');
  const w2 = (await db.collection('wallets').doc(teacherId).get()).data();
  assert.equal(Number(w2.availableBalance), Number(w1.availableBalance), 'idempotent release must not double-credit');
  console.log('idempotency ok: re-release is a no-op');

  console.log('\n✅ PACKAGE E2E UAT PASSED — สร้าง→ซื้อ→ชำระ→จองเครดิต→depleted+แจ้งเตือน→escrow release ครบ');

  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ PACKAGE E2E UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
