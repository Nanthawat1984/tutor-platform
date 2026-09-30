// End-to-end session booking UAT บน Firebase emulator (ยิงผ่าน HTTP API จริงทั้งหมด):
//   ผู้ปกครองจองคอร์ส (POST /api/bookings/recurring — endpoint เดียวที่สร้าง booking ผ่าน API)
//   → POST /api/payments/initiate (method=stripe_checkout, provider=mock บน emulator)
//   → POST /api/payments/confirm (MOCK_MODE สำเร็จทันที)
//   → ตรวจ: payment paid + booking confirmed + escrow เข้า pendingBalance ครั้งเดียว
//   → release escrow (releaseEscrowForBooking จริง — เหมือนครูกดเช็คชื่อ)
//   → ทดสอบครบทั้ง 2 branch ภาษี:
//       คอร์ส 500  → net 400  (< 1000 → ยกเว้นหัก, tax=0 + taxExemptReason)
//       คอร์ส 2500 → net 2000 (≥ 1000 → หัก 3% = 60, payout 1940)
//   → จองซ้ำช่วงเวลาเดิม → conflict (ป้องกันจองทับ)
//
// Run (ต้องเปิด emulator + dev server ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-session-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';

const PARENT = { email: 'parent.uat@example.test', password: 'Test1234!' };

const FEE_RATE = 0.2;       // PLATFORM_FEE_RATE
const TAX_RATE = 0.03;      // TAX_WITHHOLDING_RATE
const TAX_THRESHOLD = 1000; // TAX_WITHHOLDING_THRESHOLD
const SEED_TAG = 'emulator-uat';

// ── API helpers (แบบเดียวกับ verify-package-e2e.cjs) ─────────
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

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');

  // โหลด releaseEscrowForBooking จริง (alias loader เดียวกับ pnpm test)
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');
  register('./alias-loader.mjs', pathToFileURL('./scripts/'));
  const { releaseEscrowForBooking } = await import('../src/lib/payments/process.ts');

  // ── 0) seed records — คอร์สทุกตัวจาก tag (มีทั้งราคา 500 และ 2500) ──
  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).get();
  const studentsSnap = await db.collection('students').where('seed', '==', SEED_TAG).limit(1).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  assert.ok(!studentsSnap.empty, 'seed student missing — run seed-emulator-uat.cjs first');
  const courses = coursesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  const teacherId = courses[0].teacherId;
  const parentCookie = await apiLogin(PARENT);

  function addMinutes(hhmm, mins) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  console.log(`seed ok: ${courses.length} courses, student=${student.id}`);

  // ── ทดสอบต่อคอร์ส: ทั้ง branch ภาษี (ยกเว้น / หัก 3%) ──
  let conflictCourseId = null;
  let conflictDate = null;
  let conflictSlot = null;
  let leftoverBookingId = null; // booking คันล่าสุดที่ยัง pending (ไม่ได้จ่าย) ไว้ทดสอบ expiry
  let leftoverCourseTitle = '';
  for (const course of courses) {
    const amount = Number(course.pricePerSession) || 0;
    const fees = Math.round(amount * FEE_RATE);
    const netAmount = amount - fees;
    const belowThreshold = netAmount < TAX_THRESHOLD;
    const taxWithheld = belowThreshold ? 0 : Math.round(netAmount * TAX_RATE * 100) / 100;
    const payoutAmount = netAmount - taxWithheld;
    const label = `${course.title} (${amount} THB, net ${netAmount})`;
    console.log(`\n── ${label} ──`);

    // baseline wallet ต่อ iteration (คอร์สก่อนหน้าเพิ่ง release ไป — ยอดเปลี่ยนตลอด)
    const walletIter = (await db.collection('wallets').doc(teacherId).get()).data() || {};
    const pending0 = Number(walletIter.pendingBalance) || 0;
    const available0 = Number(walletIter.availableBalance) || 0;

    // 1) จอง 2 ครั้ง (คนละวัน) — ใช้เวลาจากตารางของคอร์สตัวเอง
    //    (คอร์ส 500 → 16:00, premium → 18:00 — ต่างคอร์สจึงไม่ทับกันระดับครู)
    const schedSnap = await db.collection('schedules')
      .where('courseId', '==', course.id).where('isActive', '==', true).limit(1).get();
    assert.ok(!schedSnap.empty, `no schedule for course ${course.id}`);
    const slotStart = schedSnap.docs[0].data().startTime;
    const slotEnd = addMinutes(slotStart, 60);
    const dateA = dated(1);
    const dateB = dated(2);
    const create = await apiCall(parentCookie, 'POST', '/api/bookings/recurring', {
      courseId: course.id,
      studentId: student.id,
      dates: [
        { date: dateA, startTime: slotStart, endTime: slotEnd },
        { date: dateB, startTime: slotStart, endTime: slotEnd },
      ],
    });
    assert.equal(create.status, 200, `create booking failed: ${JSON.stringify(create.data)}`);
    assert.equal(create.data.created.length, 2, `expected 2 bookings: ${JSON.stringify(create.data)}`);
    const [bookingIdA, bookingIdB] = create.data.created;
    leftoverBookingId = bookingIdB; // ไม่จ่าย — ทิ้งไว้ทดสอบ payment expiry ท้ายไฟล์
    leftoverCourseTitle = course.title || '';
    console.log(`booking ok: ${bookingIdA} (${dateA}) + ${bookingIdB} (${dateB})`);

    // 2) initiate (method=stripe_checkout → provider=mock บน emulator)
    const initiate = await apiCall(parentCookie, 'POST', '/api/payments/initiate', {
      bookingId: bookingIdA,
      method: 'stripe_checkout',
    });
    assert.equal(initiate.status, 200, `initiate failed: ${JSON.stringify(initiate.data)}`);
    const paymentId = initiate.data.paymentId;
    assert.equal(initiate.data.mode, 'mock', 'emulator must use mock provider');
    assert.equal(initiate.data.gross, amount, 'gross must equal pricePerSession');
    assert.ok(initiate.data.qrDataUrl, 'mock promptpay must return QR');
    console.log(`initiate ok: payment=${paymentId} gross=${initiate.data.gross}`);

    // 3) confirm (MOCK_MODE → markPaymentPaid ทันที)
    const confirm = await apiCall(parentCookie, 'POST', '/api/payments/confirm', { paymentId });
    assert.equal(confirm.status, 200, `confirm failed: ${JSON.stringify(confirm.data)}`);
    assert.equal(confirm.data.ok, true, 'confirm must succeed in mock mode');
    assert.ok(String(confirm.data.transactionId || '').startsWith('mock_'), 'mock transactionId');
    console.log(`confirm ok: transactionId=${confirm.data.transactionId}`);

    // 4) ตรวจผลหลังชำระ: paid + confirmed + escrow
    const pay = (await db.collection('payments').doc(paymentId).get()).data() || {};
    assert.equal(pay.status, 'paid', 'payment must be paid');
    assert.equal(pay.escrowProcessed, true, 'escrowProcessed must be set');
    assert.equal(pay.fees, fees, `fees must be ${fees}`);
    assert.equal(pay.netAmount, netAmount, `netAmount must be ${netAmount}`);
    const bookingA = (await db.collection('bookings').doc(bookingIdA).get()).data() || {};
    assert.equal(bookingA.status, 'confirmed', 'booking must be confirmed after payment');
    const walletAfterPay = (await db.collection('wallets').doc(teacherId).get()).data();
    assert.equal(
      Number(walletAfterPay.pendingBalance) - pending0,
      netAmount,
      `pending must increase by netAmount (${netAmount})`,
    );
    console.log(`paid ok: confirmed, escrow pending ${pending0} → ${walletAfterPay.pendingBalance} (+${netAmount})`);

    // 5) release escrow (เหมือนครูกดเช็คชื่อ) — ตรวจตาม branch ภาษี
    await releaseEscrowForBooking(db, bookingIdA);
    const payAfter = (await db.collection('payments').doc(paymentId).get()).data();
    assert.equal(payAfter.taxWithheld, taxWithheld, `tax must be ${taxWithheld}`);
    assert.equal(payAfter.payoutAmount, payoutAmount, `payout must be ${payoutAmount}`);
    if (belowThreshold) {
      assert.equal(payAfter.taxExemptReason, 'below_threshold_1000', 'net < 1000 must record exemption');
      console.log(`release ok: tax-exempt (net ${netAmount} < ${TAX_THRESHOLD}), available +${payoutAmount}`);
    } else {
      assert.equal(payAfter.taxExemptReason, null, 'net ≥ 1000 must be withheld 3%');
      console.log(`release ok: tax 3% = ${taxWithheld}, available +${payoutAmount}`);
    }
    const walletAfterRelease = (await db.collection('wallets').doc(teacherId).get()).data();
    assert.equal(Number(walletAfterRelease.pendingBalance), pending0, 'pending must return to baseline');
    assert.equal(
      Number(walletAfterRelease.availableBalance) - available0,
      payoutAmount,
      `available must increase by ${payoutAmount}`,
    );

    // 6) idempotency: release ซ้ำต้อง no-op
    await releaseEscrowForBooking(db, bookingIdA);
    const w2 = (await db.collection('wallets').doc(teacherId).get()).data();
    assert.equal(Number(w2.availableBalance), Number(walletAfterRelease.availableBalance), 're-release must not double-credit');
    console.log('idempotency ok: re-release is a no-op');

    // เก็บไว้ทดสอบ conflict หลัง loop
    if (!conflictCourseId) {
      conflictCourseId = course.id;
      conflictDate = dateA;
      conflictSlot = { start: slotStart, end: slotEnd };
    }
  }

  // ── 7) จองซ้ำช่วงเวลาที่ยัง confirmed อยู่ → conflict guard ──
  const dup = await apiCall(parentCookie, 'POST', '/api/bookings/recurring', {
    courseId: conflictCourseId,
    studentId: student.id,
    dates: [{ date: conflictDate, startTime: conflictSlot.start, endTime: conflictSlot.end }],
  });
  assert.equal(dup.status, 200, `duplicate booking call failed: ${JSON.stringify(dup.data)}`);
  assert.equal(dup.data.created.length, 0, 'duplicate slot must not create booking');
  assert.deepEqual(dup.data.skipped, [{ date: conflictDate, reason: 'booking_conflict' }], 'must report booking_conflict');
  console.log(`\nconflict guard ok: duplicate slot skipped (booking_conflict)`);

  // ── 8) payment expiry: pending เกิน 1 วัน → ยกเลิก + booking ถูกยกเลิกตาม ──
  // ใช้ booking pending ค้างจาก loop + สร้าง payment หมดอายุ (createdAt ย้อนหลัง 2 วัน)
  assert.ok(leftoverBookingId, 'leftover pending booking missing');
  const expiredPayRef = await db.collection('payments').add({
    bookingId: leftoverBookingId,
    parentId: student.parentId,
    teacherId,
    studentName: student.name || '',
    courseTitle: leftoverCourseTitle,
    amount: 500,
    fees: 100,
    netAmount: 400,
    currency: 'THB',
    method: 'stripe_checkout',
    provider: 'mock',
    status: 'pending',
    kind: 'session',
    escrowProcessed: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  });
  const { sweepExpiredPayments } = await import('../src/lib/payments/expiry.ts');
  const sweepResult = await sweepExpiredPayments(db);
  assert.ok(sweepResult.expiredPayments >= 1, `sweep must expire stale pending payment: ${JSON.stringify(sweepResult)}`);
  const expiredPay = (await expiredPayRef.get()).data();
  assert.equal(expiredPay.status, 'cancelled', 'stale pending payment must be cancelled');
  assert.equal(expiredPay.note, 'payment_expired_1day', 'must carry expiry note');
  const bookingBAgain = (await db.collection('bookings').doc(leftoverBookingId).get()).data();
  assert.equal(bookingBAgain.status, 'cancelled', 'pending booking must be cancelled with its payment');
  assert.equal(bookingBAgain.cancelReason, 'payment_expired', 'booking must record payment_expired reason');
  const expiryNotif = await db.collection('notifications')
    .where('userId', '==', student.parentId).where('type', '==', 'payment').limit(10).get();
  assert.ok(expiryNotif.docs.some((d) => String(d.data().title || '').includes('หมดอายุ')), 'expiry notification must be sent');
  console.log(`expiry ok: payment cancelled + booking cancelled + notified (sweep: ${JSON.stringify(sweepResult)})`);

  // ── 9) retention: cancelled เกิน 3 วัน → ลบออกจากประวัติ ──
  // markPaymentExpired ครั้งแรกใส่ cancelledAt ให้ — ทดสอบโดยตั้งย้อนหลัง 4 วันแล้ว sweep ซ้ำ
  await expiredPayRef.update({
    cancelledAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  });
  const sweep2 = await sweepExpiredPayments(db);
  assert.ok(sweep2.deletedHistory >= 1, `sweep must delete old cancelled history: ${JSON.stringify(sweep2)}`);
  const goneSnap = await expiredPayRef.get();
  assert.equal(goneSnap.exists, false, 'cancelled payment older than 3 days must be deleted');
  console.log(`retention ok: cancelled payment deleted after 3 days (sweep: ${JSON.stringify(sweep2)})`);

  // ── 10) announcements: ข่าวจากศูนย์กรองตามกลุ่มเป้าหมาย ──
  const annRef = await db.collection('announcements').add({
    title: 'UAT โปรโมชันแพ็กเกจ',
    body: 'ประชาสัมพันธ์สำหรับผู้ปกครองเท่านั้น',
    audience: 'parent',
    category: 'promotion',
    isPinned: true,
    linkUrl: null,
    published: true,
    publishedAt: new Date(),
    expiresAt: null,
    createdBy: 'uat',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const { getActiveAnnouncements } = await import('../src/lib/announcements.ts');
  const forParent = await getActiveAnnouncements(db, 'parent');
  const forTeacher = await getActiveAnnouncements(db, 'teacher');
  assert.ok(forParent.some((a) => a.id === annRef.id), 'parent must see parent-targeted announcement');
  assert.ok(!forTeacher.some((a) => a.id === annRef.id), 'teacher must NOT see parent-targeted announcement');
  console.log('announcements ok: audience filtering works (parent sees, teacher does not)');
  await annRef.delete();

  console.log('\n✅ SESSION BOOKING UAT PASSED — จอง→initiate(mock)→confirm→escrow→release (ทั้ง branch ยกเว้น/หักภาษี 3%)→conflict guard→expiry+retention+announcements ครบ');

  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ SESSION UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
