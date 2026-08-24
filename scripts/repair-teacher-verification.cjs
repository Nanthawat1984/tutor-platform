const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');
const APPLY = process.argv.includes('--apply');
const emailArgIndex = process.argv.indexOf('--email');
const email = emailArgIndex >= 0 ? String(process.argv[emailArgIndex + 1] || '').trim().toLowerCase() : '';

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/repair-teacher-verification.cjs --email <teacher-email> [--apply]');
  process.exit(1);
}

async function main() {
  const app = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  const db = getFirestore(app, 'tutor');
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();

  if (snap.empty) {
    console.error('Teacher record not found');
    await app.delete();
    process.exit(1);
  }

  const doc = snap.docs[0];
  const data = doc.data();
  if (data.role !== 'teacher') {
    console.error('Target record is not a teacher');
    await app.delete();
    process.exit(1);
  }

  const authUser = await admin.auth().getUser(doc.id);
  const emailVerified = authUser.emailVerified === true;
  console.log(JSON.stringify({
    dryRun: !APPLY,
    uid: doc.id,
    email,
    role: data.role,
    before: {
      isVerified: data.isVerified === true,
      verificationLevel: data.verificationLevel || 'none',
      adminReviewStatus: data.adminReviewStatus || null,
      kycStatus: data.kycStatus || 'none',
      emailVerified,
    },
    after: {
      isVerified: false,
      verificationLevel: emailVerified ? 'basic' : 'none',
      adminReviewStatus: 'pending',
      kycStatus: data.kycStatus || 'none',
      emailVerified,
    },
  }, null, 2));

  if (APPLY) {
    await doc.ref.update({
      emailVerified,
      isVerified: false,
      verificationLevel: emailVerified ? 'basic' : 'none',
      adminReviewStatus: 'pending',
      adminReviewedAt: null,
      adminReviewedBy: null,
      adminReviewNote: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Applied targeted teacher verification repair');
  }

  await app.delete();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Repair failed');
  process.exit(1);
});
