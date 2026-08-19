// สร้าง test user สำหรับทดสอบ email sign-in บนเวอร์ชัน deploy
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');

async function main() {
  const app = admin.initializeApp({
    credential: admin.credential.cert(KEY_FILE),
  });

  const email = 'test.parent@tutorfinder.dev';
  const password = 'TestPass123!';

  try {
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: 'Test Parent',
    });
    console.log('✅ Created test user:', user.uid, email);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.log('Test user already exists:', email);
    } else {
      console.error('Create user error:', err.message);
    }
  }

  // สร้าง profile ใน Firestore (collection users, db 'tutor')
  // ⚠️ แอปอ่านจาก db 'tutor' (ดู src/lib/firebase/server.ts getServerDb)
  // ไม่ใช่ (default) db
  const db = getFirestore(app, 'tutor');
  const usersRef = db.collection('users');
  const existing = await usersRef.where('email', '==', email).limit(1).get();
  if (existing.empty) {
    const user = await admin.auth().getUserByEmail(email);
    await usersRef.doc(user.uid).set({
      uid: user.uid,
      email,
      displayName: 'Test Parent',
      role: 'parent',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Created Firestore profile for', email);
  } else {
    console.log('Firestore profile already exists for', email);
  }

  await app.delete();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});