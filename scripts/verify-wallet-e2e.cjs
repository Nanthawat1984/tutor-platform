// End-to-end parent wallet UAT บน Firebase emulator (ยิงผ่าน HTTP API จริงทั้งหมด):
//   ผู้ปกครองจอง+จ่าย (mock gateway) → ยกเลิก ≥24 ชม. → คืนเต็มเข้า parentWallets
//   → ยกเลิก <24 ชม. → คืน 50% (อีกครึ่งชดเชยครู) → จองใหม่แล้วจ่ายด้วยเครดิตวอลเล็ต
//   → ตรวจ ledger (balance === totalCredited - totalSpent เสมอ) + GET /api/wallet
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-wallet-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';

const PARENT = { email: 'parent.uat@example.test', password: 'Test1234!' };
const SEED_TAG = 'emulator-uat';

// ── API helpers (แบบเดียวกับ verify-session-e2e.cjs) ─────────
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

function dated(offsetDays) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().split('T')[0];
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// แปลง ms → วัน/เวลาแบบ Asia/Bangkok (เลื่อน +7 ชม. แล้วอ่าน ISO เป็น wall clock)
function bangkokParts(ms) {
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');

  // ── 0) seed records ──
  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).get();
  const studentsSnap = await db.collection('students').where('seed', '==', SEED_TAG).limit(1).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  assert.ok(!studentsSnap.empty, 'seed student missing — run seed-emulator-uat.cjs first');
  // ใช้คอร์สถูกที่สุด — ยอดเครดิตหลังยกเลิก (1.5x ราคา) จะครอบคลุมการจ่ายรอบถัดไปเสมอ
  const course = coursesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.pricePerSession) || 0) - (Number(b.pricePerSession) || 0))[0];
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  const teacherId = course.teacherId;
  const amount = Number(course.pricePerSession) || 0;
  const net = amount - Math.round(amount * 0.2);

  const schedSnap = await db.collection('schedules')
    .where('courseId', '==', course.id).where('isActive', '==', true).limit(1).get();
  assert.ok(!schedSnap.empty, `no schedule for course ${course.id}`);
  const slotStart = schedSnap.docs[0].data().startTime;
  const slotEnd = addMinutes(slotStart, 60);

  const parentCookie = await apiLogin(PARENT);
  console.log(`seed ok: course=${course.id} (${amount} THB), student=${student.id}, slot=${slotStart}`);

  const parentWalletRef = db.collection('parentWallets').doc(await resolveParentUid());
  async function resolveParentUid() {
    const userSnap = await db.collection('users').where('email', '==', PARENT.email).limit(1).get();
    assert.ok(!userSnap.empty, 'parent user record missing');
    return userSnap.docs[0].id;
  }

  // ── helpers ──
  async function walletSnapshot() {
    const snap = await parentWalletRef.get();
    const w = snap.exists ? snap.data() : {};
    return {
      exists: snap.exists,
      balance: Number(w.balance) || 0,
      totalCredited: Number(w.totalCredited) || 0,
      totalSpent: Number(w.totalSpent) || 0,
    };
  }

  function assertLedger(w) {
    const invariant = Math.round((w.balance - (w.totalCredited - w.totalSpent)) * 100) / 100;
    assert.equal(invariant, 0, `ledger invariant broken: balance=${w.balance} credited=${w.totalCredited} spent=${w.totalSpent}`);
  }

  async function walletTxs(bookingId) {
    const snap = await db.collection('parentWalletTxs')
      .where('parentId', '==', parentWalletRef.id).limit(50).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => !bookingId || t.bookingId === bookingId);
  }

  // จอง + จ่ายด้วย mock gateway — คืน bookingId/paymentId/gross
  // hoursAhead: ย้ายวันเวลาของ booking ไปเป็น X ชั่วโมงข้างหน้า เพื่อให้การตัดสิน
  // ยกเลิก (≥24 / <24 ชม.) คงที่ ไม่ขึ้นกับเวลาที่รัน UAT
  async function createAndPay({ offsetDays, hoursAhead }) {
    let bookingId = null;
    for (let i = 0; i < 10 && !bookingId; i++) {
      const create = await apiCall(parentCookie, 'POST', '/api/bookings/recurring', {
        courseId: course.id,
        studentId: student.id,
        dates: [{ date: dated(offsetDays + i), startTime: slotStart, endTime: slotEnd }],
      });
      assert.equal(create.status, 200, `create booking failed: ${JSON.stringify(create.data)}`);
      bookingId = create.data.created?.[0] || null;
      if (!bookingId) console.log(`   slot ${offsetDays + i} ถูกจองแล้ว ลองวันถัดไป...`);
    }
    assert.ok(bookingId, 'could not find a free slot for the booking');

    if (hoursAhead != null) {
      const parts = bangkokParts(Date.now() + hoursAhead * 3600 * 1000);
      await db.collection('bookings').doc(bookingId).update({
        bookingDate: parts.date,
        startTime: parts.time,
        endTime: addMinutes(parts.time, 60),
      });
    }

    const initiate = await apiCall(parentCookie, 'POST', '/api/payments/initiate', {
      bookingId, method: 'stripe_checkout',
    });
    assert.equal(initiate.status, 200, `initiate failed: ${JSON.stringify(initiate.data)}`);
    const paymentId = initiate.data.paymentId;

    const confirm = await apiCall(parentCookie, 'POST', '/api/payments/confirm', { paymentId });
    assert.equal(confirm.status, 200, `confirm failed: ${JSON.stringify(confirm.data)}`);
    assert.equal(confirm.data.ok, true, 'confirm must succeed in mock mode');

    const payment = (await db.collection('payments').doc(paymentId).get()).data() || {};
    assert.equal(payment.status, 'paid', 'payment must be paid');
    const booking = (await db.collection('bookings').doc(bookingId).get()).data() || {};
    assert.equal(booking.status, 'confirmed', 'booking must be confirmed after payment');
    return { bookingId, paymentId, gross: Number(payment.amount) };
  }

  // ── 1) ยกเลิก ≥24 ชม. → คืนเต็มเข้าวอลเล็ต ──
  console.log('\n── 1) ยกเลิกล่วงหน้า ≥24 ชม. → คืนเต็ม ──');
  const before1 = await walletSnapshot();
  const full = await createAndPay({ offsetDays: 10, hoursAhead: 48 });
  const cancel1 = await apiCall(parentCookie, 'POST', `/api/bookings/${full.bookingId}/cancel`, { reason: 'UAT ยกเลิกเต็ม' });
  assert.equal(cancel1.status, 200, `cancel failed: ${JSON.stringify(cancel1.data)}`);
  assert.equal(cancel1.data.refunded, full.gross, `refunded must be full gross (${full.gross})`);

  const after1 = await walletSnapshot();
  assert.equal(after1.balance, before1.balance + full.gross, 'balance must increase by full gross');
  assert.equal(after1.totalCredited, before1.totalCredited + full.gross, 'totalCredited must increase');
  assert.equal(after1.totalSpent, before1.totalSpent, 'totalSpent must not change');
  assertLedger(after1);

  const pay1 = (await db.collection('payments').doc(full.paymentId).get()).data() || {};
  assert.equal(pay1.status, 'refunded', 'payment must be refunded');
  assert.equal(pay1.refundDestination, 'parent_wallet_credit', 'refund must go to parent wallet');
  assert.equal(Number(pay1.refundAmount), full.gross, 'refundAmount must equal gross');

  const tx1 = await walletTxs(full.bookingId);
  assert.equal(tx1.length, 1, 'exactly one ledger tx for the cancelled booking');
  assert.equal(tx1[0].kind, 'refund', 'tx kind must be refund');
  assert.equal(Number(tx1[0].amount), full.gross, 'tx amount must equal gross');
  assert.equal(Number(tx1[0].balanceAfter), after1.balance, 'balanceAfter must match wallet');
  console.log(`refund ok: +${full.gross} → balance ${before1.balance} → ${after1.balance} (ledger invariant ok)`);

  // ── 2) ยกเลิก <24 ชม. → คืน 50% + ชดเชยครู ──
  console.log('\n── 2) ยกเลิก <24 ชม. → คืน 50% + ครูได้ครึ่งที่เหลือ ──');
  const halfGross = Math.floor(full.gross / 2);
  const halfNet = Math.round((net / 2) * 100) / 100;
  const half = await createAndPay({ offsetDays: 20, hoursAhead: 5 });
  assert.equal(half.gross, full.gross, 'same course price expected');
  // snapshot ก่อนกดยกเลิก — การจ่ายเมื่อกี้เพิ่ม pending ของครูไปแล้ว net (escrow)
  const teacherBefore = (await db.collection('wallets').doc(teacherId).get()).data() || {};
  const before2 = await walletSnapshot();

  const cancel2 = await apiCall(parentCookie, 'POST', `/api/bookings/${half.bookingId}/cancel`, { reason: 'UAT ยกเลิกสาย' });
  assert.equal(cancel2.status, 200, `cancel failed: ${JSON.stringify(cancel2.data)}`);
  assert.equal(cancel2.data.refunded, halfGross, `refunded must be half gross (${halfGross})`);

  const after2 = await walletSnapshot();
  assert.equal(after2.balance, before2.balance + halfGross, 'balance must increase by half gross');
  assertLedger(after2);

  const booking2 = (await db.collection('bookings').doc(half.bookingId).get()).data() || {};
  assert.equal(booking2.lateCancel, true, 'late cancel must be flagged');
  const pay2 = (await db.collection('payments').doc(half.paymentId).get()).data() || {};
  assert.equal(pay2.partialRefund, true, 'payment must record partialRefund');
  assert.equal(Number(pay2.refundAmount), halfGross, 'refundAmount must be half');

  const teacherAfter = (await db.collection('wallets').doc(teacherId).get()).data() || {};
  assert.equal(
    Math.round(((Number(teacherAfter.pendingBalance) || 0) - (Number(teacherBefore.pendingBalance) || 0)) * 100) / 100,
    -net,
    'teacher pending must drop by full net',
  );
  assert.equal(
    Math.round(((Number(teacherAfter.availableBalance) || 0) - (Number(teacherBefore.availableBalance) || 0)) * 100) / 100,
    halfNet,
    'teacher available must gain half net',
  );
  console.log(`half refund ok: +${halfGross} (net ${net} → ครูได้ครึ่ง ${halfNet})`);

  // ── 3) จองใหม่แล้วจ่ายด้วยเครดิตวอลเล็ต ──
  console.log('\n── 3) จ่ายคลาสถัดไปด้วยเครดิตวอลเล็ต ──');
  const before3 = await walletSnapshot();
  assert.ok(before3.balance > 0, 'wallet must have credit before spending');

  const create3 = await apiCall(parentCookie, 'POST', '/api/bookings/recurring', {
    courseId: course.id,
    studentId: student.id,
    dates: [{ date: dated(30), startTime: slotStart, endTime: slotEnd }],
  });
  assert.equal(create3.status, 200, `create booking failed: ${JSON.stringify(create3.data)}`);
  const booking3Id = create3.data.created?.[0];
  assert.ok(booking3Id, `no free slot at +30d: ${JSON.stringify(create3.data)}`);

  const initiate3 = await apiCall(parentCookie, 'POST', '/api/payments/initiate', {
    bookingId: booking3Id, method: 'stripe_checkout', useWallet: true,
  });
  assert.equal(initiate3.status, 200, `initiate(useWallet) failed: ${JSON.stringify(initiate3.data)}`);
  const expectedApplied = Math.min(before3.balance, amount);
  assert.equal(initiate3.data.walletApplied, expectedApplied, 'walletApplied must equal min(balance, gross)');

  const payment3Id = initiate3.data.paymentId;
  if (!initiate3.data.paidByCredit) {
    const confirm3 = await apiCall(parentCookie, 'POST', '/api/payments/confirm', { paymentId: payment3Id });
    assert.equal(confirm3.status, 200, `confirm failed: ${JSON.stringify(confirm3.data)}`);
    assert.equal(confirm3.data.ok, true, 'confirm must succeed');
  }

  const pay3 = (await db.collection('payments').doc(payment3Id).get()).data() || {};
  assert.equal(pay3.status, 'paid', 'payment must be paid after wallet spend');
  assert.equal(Number(pay3.walletApplied), expectedApplied, 'payment.walletApplied must match');
  assert.equal(pay3.walletDeducted, true, 'wallet must be deducted');
  const booking3 = (await db.collection('bookings').doc(booking3Id).get()).data() || {};
  assert.equal(booking3.status, 'confirmed', 'booking must be confirmed');

  const after3 = await walletSnapshot();
  assert.equal(after3.balance, before3.balance - expectedApplied, 'balance must drop by walletApplied');
  assert.equal(after3.totalSpent, before3.totalSpent + expectedApplied, 'totalSpent must increase');
  assertLedger(after3);

  const tx3 = await walletTxs(booking3Id);
  assert.equal(tx3.length, 1, 'exactly one ledger tx for the paid booking');
  assert.equal(tx3[0].kind, 'spend', 'tx kind must be spend');
  assert.equal(Number(tx3[0].amount), -expectedApplied, 'spend tx amount must be negative');
  console.log(`spend ok: -${expectedApplied} → balance ${before3.balance} → ${after3.balance} (walletApplied ครบ ${expectedApplied === amount ? 'เต็มจำนวน' : 'บางส่วน'})`);

  // ── 4) GET /api/wallet คืนยอด + ประวัติถูกต้อง ──
  console.log('\n── 4) GET /api/wallet ──');
  const walletApi = await apiCall(parentCookie, 'GET', '/api/wallet');
  assert.equal(walletApi.status, 200, `wallet api failed: ${JSON.stringify(walletApi.data)}`);
  assert.equal(walletApi.data.ok, true, 'wallet api must be ok');
  assert.equal(Number(walletApi.data.wallet.balance), after3.balance, 'api balance must match store');
  assert.equal(Number(walletApi.data.wallet.totalCredited), after3.totalCredited, 'api totalCredited must match');
  assert.equal(Number(walletApi.data.wallet.totalSpent), after3.totalSpent, 'api totalSpent must match');
  const apiKinds = new Set(walletApi.data.transactions.map((t) => t.kind));
  assert.ok(apiKinds.has('refund') && apiKinds.has('spend'), `api must list refund+spend txs: ${[...apiKinds]}`);
  console.log(`api ok: balance=${walletApi.data.wallet.balance}, txs=${walletApi.data.transactions.length} (refund+spend ครบ)`);

  console.log('\n✅ WALLET UAT PASSED — ยกเลิกคืนเต็ม → ยกเลิกคืน 50% (+ชดเชยครู) → ใช้เครดิตจ่าย → ledger invariant + GET /api/wallet ครบ');

  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ WALLET UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
