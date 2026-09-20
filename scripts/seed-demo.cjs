// Seed demo data for testing the payment flow (non-destructive):
//   1. courses — 1 course for the verified teacher
//   2. students — 1 student for the test parent
// Run: node scripts/seed-demo.cjs
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');

const TEACHER_EMAIL = 'thanyanant.2560@gmail.com';
const PARENT_EMAIL = 'test.parent@tutorfinder.dev';

async function main() {
  const app = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  const db = getFirestore(app, 'tutor');

  // --- Resolve teacher ---
  const teacherAuth = await admin.auth().getUserByEmail(TEACHER_EMAIL);
  const teacherId = teacherAuth.uid;
  const teacherUserSnap = await db.collection('users').doc(teacherId).get();
  const teacherName = (teacherUserSnap.data() && (teacherUserSnap.data().displayName || teacherUserSnap.data().email?.split('@')[0])) || 'Demo Teacher';

  // --- Resolve test parent ---
  const parentAuth = await admin.auth().getUserByEmail(PARENT_EMAIL);
  const parentId = parentAuth.uid;
  const parentUserSnap = await db.collection('users').doc(parentId).get();
  const parentName = (parentUserSnap.data() && parentUserSnap.data().displayName) || 'Test Parent';

  // --- Subject (get or create reference data) ---
  let subjectId = null;
  let subjectName = 'คณิตศาสตร์';
  const subjectsSnap = await db.collection('subjects').limit(5).get();
  if (!subjectsSnap.empty) {
    const first = subjectsSnap.docs[0];
    subjectId = first.id;
    subjectName = first.data().name || subjectName;
    console.log('ℹ️ Reusing subject:', subjectId, subjectName);
  } else {
    const subRef = await db.collection('subjects').add({
      name: subjectName,
      category: 'math',
      sortOrder: 1,
      isActive: true,
    });
    subjectId = subRef.id;
    console.log('✅ Created subject:', subjectId, subjectName);
  }

  // --- Create course (only if teacher has none) ---
  const existingCourses = await db.collection('courses')
    .where('teacherId', '==', teacherId)
    .limit(3)
    .get();

  let courseId;
  if (!existingCourses.empty) {
    courseId = existingCourses.docs[0].id;
    console.log('ℹ️ Teacher already has course, reusing:', courseId, existingCourses.docs[0].data().title);
  } else {
    const courseRef = await db.collection('courses').add({
      teacherId,
      teacherName,
      subjectId,
      subjectName,
      title: 'คณิตศาสตร์พื้นฐาน ม.ต้น (เตรียมสอบ)',
      description: 'ปูพื้นฐานเลข ม.ต้น เน้นทำโจทย์และเตรียมสอบห้องเรียนพิเศษ',
      level: 'ม.2',
      format: 'one_on_one',
      maxStudents: 1,
      pricePerSession: 500,
      priceCurrency: 'THB',
      durationMinutes: 60,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    courseId = courseRef.id;
    console.log('✅ Created course:', courseId, '(500 THB/session)');
  }

  // --- Create student for test parent (only if none) ---
  const existingStudents = await db.collection('students')
    .where('parentId', '==', parentId)
    .limit(3)
    .get();

  let studentId;
  if (!existingStudents.empty) {
    studentId = existingStudents.docs[0].id;
    console.log('ℹ️ Parent already has student, reusing:', studentId, existingStudents.docs[0].data().name);
  } else {
    const studentRef = await db.collection('students').add({
      parentId,
      name: 'น้องปั้น',
      level: 'ม.2',
      school: 'โรงเรียนสาธิตทดลอง',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    studentId = studentRef.id;
    console.log('✅ Created student:', studentId, 'น้องปั้น (ม.2)');
  }

  console.log('\n=== Seed summary ===');
  console.log('teacher:', teacherId, teacherName);
  console.log('parent :', parentId, parentName);
  console.log('course :', courseId);
  console.log('student:', studentId);
  console.log('\n👉 Next: browse /explore → click "จองเลย" to start the payment flow');

  await app.delete();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
