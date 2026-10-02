// End-to-end reschedule + dispute UAT บน Firebase emulator (ยิงผ่าน HTTP API จริงทั้งหมด):
//   ผู้ปกครองจองคอร์ส → ชำระ mock gateway → booking confirmed
//   → POST /api/bookings/[id]/reschedule (ฟรี ≥ 24 ชม.) ×2
//   → ตรวจ: วันเวลาเปลี่ยน + rescheduleCount +1 + แจ้งเตือนครู + ไม่ติดธง
//   → ครั้งที่ 3 (≥ 24 ชม.) → 409 too_many_reschedules
//   → เลื่อนสาย (< 24 ชม.): เขียน bookingDate/startTime = now+3h ลง Firestore ตรง ๆ
//     (emulator เท่านั้น — guard ด้านล่างกันยิงโปรดักชัน) → API ยอมรับแต่ติด lateReschedule=true
//   → ครูเปิดข้อพิพาท (PUT /api/bookings/[id]/dispute) → disputeOpen + แจ้งผู้ปกครอง
//   → ข้อพิพาทซ้ำ → 409 already_open (idempotency)
//   → admin resolve (resolveBookingDispute จริง — เหมือนหน้า /admin/disputes) → แจ้งทั้งสองฝ่าย
//   → หลัง resolve เลื่อนต่อได้ (late) → ปิดท้ายยกเลิก booking กันเปื้อนรอบถัดไป
//
// หมายเหตุ slot เป้าหมาย: reschedule API ตรวจ slot กับตารางครู (validateBookingSlot)
// schedule ที่ seed ไว้เป็น recurring รายสัปดาห์เริ่มวันนี้ → วันเป้าหมายต้องเป็น
// วันนี้ + 7k วัน (dated(7)/dated(14)/dated(21)) จึงจะ valid
//
// Run (ต้องเปิด emulator + dev server + seed ก่อน):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/verify-reschedule-dispute-e2e.cjs
//
// Safety: ต้องตั้ง FIRESTORE_EMULATOR_HOST เท่านั้น — ไม่มีทางยิงโปรดักชันด้วยตัวเอง
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const API = process.env.UAT_API || 'http://localhost:3000';
const PROJECT_ID = process.env.UAT_PROJECT_ID || 'tutor-platform-4e38f';

const PARENT = { email: 'parent.uat@example.test', password: 'Test1234!' };
const TEACHER = { email: 'teacher.uat@example.test', password: 'Test1234!' };

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

// วันเวลา "ตอนนี้บวก N ชั่วโมง" ในเขียวเวลาไทย — ใช้สร้างสถานการณ์เลื่อนสาย (< 24 ชม.)
// แบบ deterministic ไม่ขึ้นกับเวลาที่รันเทสต์ (date เป็น en-CA = YYYY-MM-DD)
function bangkokOffset(hoursAhead) {
  const dt = new Date(Date.now() + hoursAhead * 3_600_000);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(dt);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt);
  return { date, time };
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function main() {
  const admin = require('firebase-admin');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, 'tutor');

  // โหลด resolveBookingDispute จริง (เหมือนที่หน้า /admin/disputes เรียก)
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');
  register('./alias-loader.mjs', pathToFileURL('./scripts/'));
  const { resolveBookingDispute } = await import('../src/lib/booking-actions.ts');

  // ── 0) seed records ──
  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).get();
  const studentsSnap = await db.collection('students').where('seed', '==', SEED_TAG).limit(1).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  assert.ok(!studentsSnap.empty, 'seed student missing — run seed-emulator-uat.cjs first');
  const courses = coursesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  const course = courses.find((c) => Number(c.pricePerSession) === 500) || courses[courses.length - 1];
  const teacherId = course.teacherId;
  const parentCookie = await apiLogin(PARENT);
  const teacherCookie = await apiLogin(TEACHER);

  console.log(`seed ok: course=${course.id} (${course.title}), student=${student.id}`);

  // ── 0.5) cleanup: ยกเลิก booking ค้างของครู UAT จาก flow ก่อนหน้า (emulator เท่านั้น) ──
  //    package/session UAT ที่รันไปก่อนหน้าทิ้ง booking confirmed/pending ไว้ — ถ้าไม่เก็บ
  //    slot เป้าหมายจะโดน booking_conflict ทั้งที่สคริปต์เองถูกต้อง (ทำให้ลำดับการรันไม่มีผล)
  const staleSnap = await db.collection('bookings')
    .where('teacherId', '==', teacherId)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  if (!staleSnap.empty) {
    const batch = db.batch();
    staleSnap.docs.forEach((d) => batch.update(d.ref, {
      status: 'cancelled',
      note: 'uat_cleanup',
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    console.log(`cleanup ok: cancelled ${staleSnap.size} stale booking(s) from previous flows`);
  }

  // ── 1) จอง + จ่าย mock ให้ confirmed ──
  const schedSnap = await db.collection('schedules')
    .where('courseId', '==', course.id).where('isActive', '==', true).limit(1).get();
  assert.ok(!schedSnap.empty, `no schedule for course ${course.id}`);
  const schedule = schedSnap.docs[0].data();
  const scheduleId = schedSnap.docs[0].id;
  const slotStart = schedule.startTime; // 16:00
  const slotEnd = addMinutes(slotStart, 60); // เซสชันตาม durationMinutes (60 นาที)
  const dateA = dated(5);

  const create = await apiCall(parentCookie, 'POST', '/api/bookings/recurring', {
    courseId: course.id,
    studentId: student.id,
    dates: [{ date: dateA, startTime: slotStart, endTime: slotEnd }],
  });
  assert.equal(create.status, 200, `create booking failed: ${JSON.stringify(create.data)}`);
  assert.equal(create.data.created.length, 1, `expected 1 booking: ${JSON.stringify(create.data)}`);
  const bookingId = create.data.created[0];

  const initiate = await apiCall(parentCookie, 'POST', '/api/payments/initiate', {
    bookingId,
    method: 'stripe_checkout',
  });
  assert.equal(initiate.status, 200, `initiate failed: ${JSON.stringify(initiate.data)}`);
  const paymentId = initiate.data.paymentId;
  assert.equal(initiate.data.mode, 'mock', 'emulator must use mock provider');
  const confirm = await apiCall(parentCookie, 'POST', '/api/payments/confirm', { paymentId });
  assert.equal(confirm.status, 200, `confirm failed: ${JSON.stringify(confirm.data)}`);
  const booking0 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking0.status, 'confirmed', 'booking must be confirmed after payment');
  assert.equal(Number(booking0.rescheduleCount) || 0, 0, 'fresh booking must have rescheduleCount=0');
  console.log(`booking ok: ${bookingId} (${dateA} ${slotStart}-${slotEnd}) confirmed`);

  // ── 2) เลื่อนฟรีครั้งที่ 1 (≥ 24 ชม.) — ไปวัน schedule ถัดไป (+7 วัน) ──
  const dateB = dated(7);
  const reschedule1 = await apiCall(parentCookie, 'POST', `/api/bookings/${bookingId}/reschedule`, {
    slot: { scheduleId, date: dateB, startTime: slotStart, endTime: slotEnd },
  });
  assert.equal(reschedule1.status, 200, `reschedule #1 failed: ${JSON.stringify(reschedule1.data)}`);
  const booking1 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking1.bookingDate, dateB, 'bookingDate must change after reschedule');
  assert.equal(Number(booking1.rescheduleCount), 1, 'rescheduleCount must be 1');
  assert.equal(booking1.lateReschedule, false, 'reschedule ≥24h must not flag lateReschedule');
  const teacherNotif1 = await db.collection('notifications')
    .where('userId', '==', teacherId).where('type', '==', 'booking').limit(10).get();
  assert.ok(
    teacherNotif1.docs.some((d) => String(d.data().title || '').includes('เลื่อนเวลาเรียน')),
    'teacher must be notified about the reschedule',
  );
  console.log(`reschedule #1 ok: → ${dateB} ${slotStart} (count=1, no late flag, teacher notified)`);

  // ── 3) เลื่อนฟรีครั้งที่ 2 (≥ 24 ชม.) ──
  const dateC = dated(14);
  const reschedule2 = await apiCall(parentCookie, 'POST', `/api/bookings/${bookingId}/reschedule`, {
    slot: { scheduleId, date: dateC, startTime: slotStart, endTime: slotEnd },
  });
  assert.equal(reschedule2.status, 200, `reschedule #2 failed: ${JSON.stringify(reschedule2.data)}`);
  const booking2 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking2.bookingDate, dateC, 'bookingDate must change after reschedule #2');
  assert.equal(Number(booking2.rescheduleCount), 2, 'rescheduleCount must be 2');
  console.log(`reschedule #2 ok: → ${dateC} (count=2 — free quota used up)`);

  // ── 4) เลื่อนครั้งที่ 3 แบบ ≥ 24 ชม. → ติด too_many_reschedules ──
  const dateD = dated(21);
  const reschedule3 = await apiCall(parentCookie, 'POST', `/api/bookings/${bookingId}/reschedule`, {
    slot: { scheduleId, date: dateD, startTime: slotStart, endTime: slotEnd },
  });
  assert.equal(reschedule3.status, 409, `reschedule #3 (≥24h) must be rejected: ${JSON.stringify(reschedule3.data)}`);
  assert.equal(reschedule3.data.error, 'too_many_reschedules', 'must report too_many_reschedules');
  console.log('limit ok: 3rd free reschedule blocked (too_many_reschedules)');

  // ── 5) เลื่อนสาย (< 24 ชม.) — ตั้งเซสชันเป็น now+3h แล้วเลื่อน (emulator เท่านั้น) ──
  //    policy: เลื่อนสายได้แม้โควตาฟรีเต็ม แต่ติดธง lateReschedule ให้ครูเห็น
  const nearTerm = bangkokOffset(3);
  await db.collection('bookings').doc(bookingId).update({
    bookingDate: nearTerm.date,
    startTime: nearTerm.time,
    endTime: addMinutes(nearTerm.time, 60),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const rescheduleLate = await apiCall(parentCookie, 'POST', `/api/bookings/${bookingId}/reschedule`, {
    slot: { scheduleId, date: dateD, startTime: slotStart, endTime: slotEnd },
  });
  assert.equal(rescheduleLate.status, 200, `late reschedule must be allowed: ${JSON.stringify(rescheduleLate.data)}`);
  const booking3 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking3.bookingDate, dateD, 'late reschedule must move the session');
  assert.equal(Number(booking3.rescheduleCount), 3, 'rescheduleCount must be 3');
  assert.equal(booking3.lateReschedule, true, 'late reschedule must set lateReschedule=true');
  console.log(`late reschedule ok: <24h allowed despite full quota → ${dateD} (lateReschedule=true)`);

  // ── 6) ครูเปิดข้อพิพาท (ไม่เห็นด้วยกับการเลื่อนสาย) ──
  const dispute = await apiCall(teacherCookie, 'PUT', `/api/bookings/${bookingId}/dispute`, {
    reason: 'ผู้ปกครองเลื่อนแบบไม่แจ้งล่วงหน้า',
    note: 'แจ้งเลื่อนเพียง 3 ชั่วโมงก่อนเรียน',
  });
  assert.equal(dispute.status, 200, `dispute failed: ${JSON.stringify(dispute.data)}`);
  const booking4 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking4.dispute?.status, 'open', 'dispute must be open');
  assert.equal(booking4.disputeOpen, true, 'disputeOpen must be true');
  assert.equal(booking4.dispute?.filedBy, 'teacher', 'dispute.filedBy must be teacher');
  const parentNotif = await db.collection('notifications')
    .where('userId', '==', student.parentId).where('type', '==', 'booking').limit(20).get();
  assert.ok(
    parentNotif.docs.some((d) => String(d.data().title || '').includes('ข้อพิพาท')),
    'parent must be notified about the dispute',
  );
  console.log('dispute ok: opened by teacher, parent notified');

  // ── 7) idempotency: เปิดข้อพิพาทซ้ำต้องถูกปฏิเสธ ──
  const disputeDup = await apiCall(parentCookie, 'PUT', `/api/bookings/${bookingId}/dispute`, {
    reason: 'เปิดซ้ำไม่ได้',
  });
  assert.equal(disputeDup.status, 409, `duplicate dispute must be rejected: ${JSON.stringify(disputeDup.data)}`);
  assert.equal(disputeDup.data.error, 'already_open', 'duplicate dispute must report already_open');
  console.log('dispute idempotency ok: second dispute rejected (already_open)');

  // ── 8) admin resolve — ปิดข้อพิพาท + คืนเครดิตวอลเล็ต + แจ้งทั้งสองฝ่าย ──
  const walletBefore = (await db.collection('parentWallets').doc(student.parentId).get()).data() || {};
  const balanceBefore = Number(walletBefore.balance) || 0;
  const paymentBefore = (await db.collection('payments').doc(paymentId).get()).data() || {};
  const refundable = Math.round(Number(paymentBefore.amount) || 0);
  const resolve = await resolveBookingDispute(db, {
    bookingId,
    note: 'ตรวจสอบแล้ว ให้เลื่อนไปวันใหม่ได้ ครั้งนี้ยกเว้น',
    outcome: 'refund_full',
    adminId: 'uat-admin',
  });
  assert.equal(resolve.ok, true, `resolve failed: ${JSON.stringify(resolve)}`);
  assert.equal(resolve.refunded, refundable, `refunded must equal paid amount (${refundable})`);
  const booking5 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking5.dispute?.status, 'resolved', 'dispute must be resolved');
  assert.equal(booking5.disputeOpen, false, 'disputeOpen must flip to false');
  assert.ok(booking5.dispute?.resolvedAt, 'resolvedAt must be set');
  assert.equal(booking5.dispute?.outcome, 'refund_full', 'dispute.outcome must be recorded');
  assert.equal(Number(booking5.dispute?.refundedAmount), refundable, 'dispute.refundedAmount must be recorded');

  // คืนเงินจริงเข้าวอลเล็ต + ledger + payment
  const walletAfter = (await db.collection('parentWallets').doc(student.parentId).get()).data() || {};
  assert.equal(
    Number(walletAfter.balance) - balanceBefore,
    refundable,
    `parent wallet must increase by ${refundable}`,
  );
  assert.equal(
    Math.round((Number(walletAfter.balance) - (Number(walletAfter.totalCredited) - Number(walletAfter.totalSpent))) * 100) / 100,
    0,
    'wallet ledger invariant must hold after dispute refund',
  );
  const disputeTxs = await db.collection('parentWalletTxs')
    .where('parentId', '==', student.parentId).where('bookingId', '==', bookingId).limit(5).get();
  assert.ok(!disputeTxs.empty, 'dispute refund must create a wallet ledger entry');
  assert.equal(Number(disputeTxs.docs[0].data().amount), refundable, 'ledger amount must equal refund');
  const paymentAfter = (await db.collection('payments').doc(paymentId).get()).data() || {};
  assert.equal(paymentAfter.refundDestination, 'parent_wallet_credit', 'payment must record refund destination');
  assert.equal(paymentAfter.disputeRefund?.outcome, 'refund_full', 'payment must record disputeRefund');
  // ไม่แตะยอดของครู — เซสชันจบไปแล้ว/เงินถูกปล่อยเป็น available
  assert.equal(paymentAfter.status, 'paid', 'dispute refund must not re-open payment status');
  console.log(`resolve ok: dispute closed + คืนเครดิต ${refundable} บาทเข้าวอลเล็ต + both parties notified`);

  // ── 8b) ครูเปิดห้องคุยกับผู้ปกครองเองได้ (เฉพาะคู่ที่เคยจองด้วยกัน) ──
  const chatOpen = await apiCall(teacherCookie, 'POST', '/api/conversations', {
    parentId: student.parentId,
    bookingId,
  });
  assert.equal(chatOpen.status, 200, `teacher chat must work: ${JSON.stringify(chatOpen.data)}`);
  assert.ok(chatOpen.data.conversation?.id, 'conversation id must be returned');
  const chatBlocked = await apiCall(teacherCookie, 'POST', '/api/conversations', {
    parentId: 'uat-stranger-parent',
  });
  assert.equal(chatBlocked.status, 403, `teacher must not chat with unrelated parent: ${JSON.stringify(chatBlocked.data)}`);
  assert.equal(chatBlocked.data.error, 'forbidden', 'must report forbidden');
  console.log('teacher chat ok: เปิดห้องกับผู้ปกครองที่เคยจองได้ + บล็อกผู้ปกครองที่ไม่ใช่คู่สัญญา');
  const bothNotifs = await db.collection('notifications')
    .where('type', '==', 'booking').limit(50).get();
  assert.ok(
    bothNotifs.docs.some((d) => String(d.data().title || '').includes('แก้ไขแล้ว')),
    'both parties must receive a resolution notification',
  );

  // ── 9) หลัง resolve → เลื่อนต่อได้ (late — ตั้งเซสชันใกล้เข้ามาอีกครั้ง) ──
  //    booking อยู่ที่ dateD 16:00 อยู่แล้ว — เลื่อนเป็นวันเดียวกันแต่เวลาถัดไป (17:00)
  //    ตัวเองถูกตัดออกจาก conflict check จึงไม่ชนตัวเอง
  const nearTerm2 = bangkokOffset(4);
  await db.collection('bookings').doc(bookingId).update({
    bookingDate: nearTerm2.date,
    startTime: nearTerm2.time,
    endTime: addMinutes(nearTerm2.time, 60),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const rescheduleAfter = await apiCall(parentCookie, 'POST', `/api/bookings/${bookingId}/reschedule`, {
    slot: { scheduleId, date: dateD, startTime: addMinutes(slotStart, 60), endTime: addMinutes(slotStart, 120) },
  });
  assert.equal(rescheduleAfter.status, 200, `reschedule after resolve must work: ${JSON.stringify(rescheduleAfter.data)}`);
  const booking6 = (await db.collection('bookings').doc(bookingId).get()).data() || {};
  assert.equal(booking6.bookingDate, dateD, 'post-resolve booking must land on target date');
  assert.equal(booking6.startTime, addMinutes(slotStart, 60), 'post-resolve booking must land on target time');
  console.log('post-resolve ok: reschedule works again after dispute closed');

  // ── 10) cleanup: ยกเลิก booking ทิ้ง (emulator เท่านั้น) — กันรอบหน้าชน slot เดิม ──
  await db.collection('bookings').doc(bookingId).update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('cleanup ok: booking cancelled for re-runs');

  console.log('\n✅ RESCHEDULE + DISPUTE UAT PASSED — จอง→ชำระ→เลื่อนฟรี×2→เกินโควตา→เลื่อนสาย(ธง)→dispute→resolve→แจ้งครบ');

  await app.delete();
}

main().catch((err) => {
  console.error('\n❌ RESCHEDULE/DISPUTE UAT FAILED:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
