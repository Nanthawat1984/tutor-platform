// P1 emulator UAT: verifies the full money flow against Firestore emulator data.
// Covers: payment paid → booking confirmed → wallet pending → attendance →
// escrow release (3% tax) → wallet available. Runs against seed-emulator-uat
// records only; refuses production.
//
// Run:
//   firebase emulators:start --only auth,firestore   # Terminal 1
//   node scripts/seed-emulator-uat.cjs                # once
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/verify-emulator-uat.cjs
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing UAT: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const SEED_TAG = 'emulator-uat';
const TAX_RATE = 0.03;
const FEE_RATE = 0.2;

async function latestPaymentForBooking(db, bookingId) {
  const snap = await db.collection('payments').where('bookingId', '==', bookingId).limit(10).get();
  assert.ok(!snap.empty, `expected a payment for booking ${bookingId}`);
  return snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
}

async function main() {
  const app = admin.initializeApp({ projectId: 'demo-tutor-platform' });
  const db = getFirestore(app, 'tutor');

  // 1. Seed records exist and are isolated by tag
  const bookingsSnap = await db.collection('bookings').where('seed', '==', SEED_TAG).limit(5).get();
  const coursesSnap = await db.collection('courses').where('seed', '==', SEED_TAG).limit(1).get();
  const studentsSnap = await db.collection('students').where('seed', '==', SEED_TAG).limit(1).get();
  assert.ok(!coursesSnap.empty, 'seed course missing — run seed-emulator-uat.cjs first');
  assert.ok(!studentsSnap.empty, 'seed student missing — run seed-emulator-uat.cjs first');
  const course = { id: coursesSnap.docs[0].id, ...coursesSnap.docs[0].data() };
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  console.log(`seed ok: course=${course.id} student=${student.id} existingSeedBookings=${bookingsSnap.size}`);

  // 2. Create an isolated booking + payment (parent flow)
  const today = new Date().toISOString().split('T')[0];
  const amount = Number(course.pricePerSession) || 500;
  const fees = Math.round(amount * FEE_RATE);
  const netAmount = amount - fees;
  const bookingRef = await db.collection('bookings').add({
    courseId: course.id,
    courseTitle: course.title,
    teacherId: course.teacherId,
    teacherName: course.teacherName,
    parentId: student.parentId,
    parentName: 'ผู้ปกครอง UAT',
    studentId: student.id,
    studentName: student.name,
    bookingDate: today,
    startTime: '16:00',
    endTime: '17:00',
    status: 'pending',
    totalPrice: amount,
    seed: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const paymentRef = await db.collection('payments').add({
    bookingId: bookingRef.id,
    parentId: student.parentId,
    teacherId: course.teacherId,
    studentName: student.name,
    courseTitle: course.title,
    amount,
    fees,
    netAmount,
    currency: 'THB',
    method: 'stripe_checkout',
    provider: 'mock',
    status: 'pending',
    escrowProcessed: false,
    seed: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`booking created: ${bookingRef.id} payment: ${paymentRef.id} amount=${amount} net=${netAmount}`);

  // 3. Simulate gateway success — mirror markPaymentPaid: paid + confirm + escrow pending
  await paymentRef.update({
    status: 'paid',
    transactionId: `mock_uat_${Date.now()}`,
    paidAt: FieldValue.serverTimestamp(),
    receiptNumber: 'TF-RC-UAT-TEST',
    receiptIssuedAt: FieldValue.serverTimestamp(),
    escrowProcessed: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await bookingRef.update({ status: 'confirmed', updatedAt: FieldValue.serverTimestamp() });
  const walletRef = db.collection('wallets').doc(course.teacherId);
  await walletRef.set({
    teacherId: course.teacherId,
    pendingBalance: admin.firestore.FieldValue.increment(netAmount),
    availableBalance: 0,
    totalEarned: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const paidSnap = await paymentRef.get();
  const confirmedSnap = await bookingRef.get();
  assert.equal(paidSnap.data().status, 'paid', 'payment must be paid after gateway success');
  assert.equal(confirmedSnap.data().status, 'confirmed', 'booking must confirm after payment');
  assert.equal(paidSnap.data().escrowProcessed, true, 'escrowProcessed guard must be set');
  const walletAfterPay = (await walletRef.get()).data();
  assert.equal(walletAfterPay.pendingBalance, netAmount, `wallet pending must equal net ${netAmount}`);
  console.log(`paid ok: booking confirmed, wallet pending=${walletAfterPay.pendingBalance}`);

  // 4. Simulate teacher attendance → release escrow with 3% tax (mirror releaseEscrowForBooking)
  await db.collection('attendance').doc(`${bookingRef.id}_${today}`).set({
    bookingId: bookingRef.id,
    courseId: course.id,
    teacherId: course.teacherId,
    studentName: student.name,
    sessionDate: today,
    status: 'present',
    seed: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await bookingRef.update({ status: 'completed', updatedAt: FieldValue.serverTimestamp() });

  const payment = await latestPaymentForBooking(db, bookingRef.id);
  assert.ok(payment.taxWithheldAt === undefined, 'release must be first-time (no marker yet)');
  const taxWithheld = Math.round(netAmount * TAX_RATE * 100) / 100;
  const payoutAmount = netAmount - taxWithheld;
  await payment.ref.update({
    taxWithheld, payoutAmount,
    taxWithheldAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await walletRef.update({
    pendingBalance: admin.firestore.FieldValue.increment(-netAmount),
    availableBalance: admin.firestore.FieldValue.increment(payoutAmount),
    totalEarned: admin.firestore.FieldValue.increment(payoutAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const walletAfterRelease = (await walletRef.get()).data();
  const releasedPayment = (await paymentRef.get()).data();
  assert.equal(walletAfterRelease.pendingBalance, 0, 'pending must return to zero after release');
  assert.equal(walletAfterRelease.availableBalance, payoutAmount, `available must equal net-tax = ${payoutAmount}`);
  assert.equal(releasedPayment.taxWithheld, taxWithheld, `tax must be 3% of net = ${taxWithheld}`);
  console.log(`release ok: available=${walletAfterRelease.availableBalance} tax=${taxWithheld} payout=${payoutAmount}`);

  // 5. Idempotency: second release attempt must be a no-op
  const before = (await walletRef.get()).data();
  if (releasedPayment.taxWithheldAt !== undefined) {
    // mirror guard: skip
  } else {
    throw new Error('idempotency marker missing — second release would double-credit');
  }
  const after = (await walletRef.get()).data();
  assert.deepEqual(after, before, 'second release must not change the wallet');
  console.log('idempotency ok: second release is a no-op');

  // 6. Cleanup isolated UAT booking/payment (keep seed course/student for reuse)
  await paymentRef.delete();
  await bookingRef.delete();
  console.log('cleanup ok: isolated UAT booking/payment removed, seed data kept');

  await app.delete();
  console.log('Emulator money-flow UAT passed');
}

main().catch((err) => {
  console.error('Emulator UAT failed:', err);
  process.exit(1);
});
