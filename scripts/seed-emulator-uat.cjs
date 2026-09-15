// Emulator-safe seed for local UAT (NEVER touches production).
// Creates isolated teacher + parent + course + student + schedule records with
// a `seed: 'emulator-uat'` marker so UAT flows run without touching real data.
//
// Run:
//   firebase emulators:start --only auth,firestore   # Terminal 1
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   node scripts/seed-emulator-uat.cjs                # Terminal 2
//
// Safety: refuses to run unless FIRESTORE_EMULATOR_HOST is set, so a missing
// env can never seed production by accident.
const assert = require('node:assert/strict');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, 'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (start the emulator first)');

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const SEED_TAG = 'emulator-uat';
const now = () => FieldValue.serverTimestamp();

async function ensureUser({ auth, db, email, displayName, role }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: 'Test1234!', displayName, emailVerified: true });
  }
  const ref = db.collection('users').doc(user.uid);
  await ref.set({
    uid: user.uid,
    email,
    displayName,
    role,
    isVerified: role !== 'teacher',
    verificationLevel: role === 'teacher' ? 'full' : 'basic',
    emailVerified: true,
    adminReviewStatus: role === 'teacher' ? 'approved' : undefined,
    kycStatus: role === 'teacher' ? 'verified' : undefined,
    seed: SEED_TAG,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });
  return { uid: user.uid, displayName };
}

async function main() {
  const app = admin.initializeApp({ projectId: 'demo-tutor-platform' });
  const auth = admin.auth(app);
  const db = getFirestore(app, 'tutor');

  const teacher = await ensureUser({
    auth, db,
    email: 'teacher.uat@example.test',
    displayName: 'ครู UAT',
    role: 'teacher',
  });
  const parent = await ensureUser({
    auth, db,
    email: 'parent.uat@example.test',
    displayName: 'ผู้ปกครอง UAT',
    role: 'parent',
  });

  await db.collection('teachers').doc(teacher.uid).set({
    uid: teacher.uid,
    experienceYears: 5,
    teachingStyle: ['exam_focused'],
    rating: 0,
    totalReviews: 0,
    totalStudents: 0,
    isActive: true,
    seed: SEED_TAG,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  const subjectRef = await db.collection('subjects').add({
    name: 'คณิตศาสตร์ UAT', category: 'math', sortOrder: 1, isActive: true, seed: SEED_TAG,
  });

  const courseRef = await db.collection('courses').add({
    teacherId: teacher.uid,
    teacherName: teacher.displayName,
    subjectId: subjectRef.id,
    subjectName: 'คณิตศาสตร์ UAT',
    title: 'คณิตศาสตร์ UAT ม.2 (ชั่วโมงละ 500)',
    description: 'คอร์สจำลองสำหรับ UAT บน emulator เท่านั้น',
    level: 'ม.2',
    format: 'one_on_one',
    maxStudents: 1,
    pricePerSession: 500,
    priceCurrency: 'THB',
    durationMinutes: 60,
    isActive: true,
    seed: SEED_TAG,
    createdAt: now(),
    updatedAt: now(),
  });

  const startDate = new Date().toISOString().split('T')[0];
  await db.collection('schedules').add({
    courseId: courseRef.id,
    courseTitle: 'คณิตศาสตร์ UAT ม.2',
    teacherId: teacher.uid,
    dayOfWeek: new Date().getDay(),
    startTime: '16:00',
    endTime: '18:00',
    startDate,
    endDate: null,
    isRecurring: true,
    isActive: true,
    seed: SEED_TAG,
    createdAt: now(),
    updatedAt: now(),
  });

  const studentRef = await db.collection('students').add({
    parentId: parent.uid,
    name: 'น้อง UAT',
    level: 'ม.2',
    school: 'โรงเรียนจำลอง UAT',
    seed: SEED_TAG,
    createdAt: now(),
    updatedAt: now(),
  });

  console.log('=== Emulator UAT seed ===');
  console.log('teacher:', teacher.uid, teacher.displayName, '<teacher.uat@example.test / Test1234!>');
  console.log('parent :', parent.uid, parent.displayName, '<parent.uat@example.test / Test1234!>');
  console.log('course :', courseRef.id);
  console.log('student:', studentRef.id);
  console.log('Next: pnpm dev → login as parent → /explore → จองคอร์ส UAT → ชำระ mock → login as teacher → เช็คชื่อ');

  await app.delete();
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
