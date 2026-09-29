// พิสูจน์ว่า client อ่านข้อความสดได้จริง (Firestore rules + onSnapshot)
//   node scripts/verify-realtime-chat.cjs [conversationId]
// ผู้ปกครองเปิด listener → ครูส่งข้อความผ่าน API → ต้องเห็นในไม่กี่วินาทีโดยไม่ refresh
// และตรวจว่าบัญชีที่ไม่ใช่คู่สนทนาถูก Firestore rules ปฏิเสธ

const path = require('path');
const admin = require('firebase-admin');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');
const API_KEY = 'AIzaSyAruhI20eFBNsQQS1Dm6yMA03TZAmeh9XM';
const API = 'https://tutorfinder.pilotai.space';

// Node ไม่ส่ง Referer แต่ API key ของโปรเจกต์ล็อก HTTP referrer
// → client SDK จะถูกบล็อก ต้องเติม Referer ให้ทุกคำขอ
const rawFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('referer')) headers.set('referer', API);
  return rawFetch(input, { ...init, headers });
};

const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, onSnapshot, query, orderBy, limit } = require('firebase/firestore');

const PARENT = { email: 'test.parent@tutorfinder.dev', password: 'TestPass123!' };
const OUTSIDER = { email: 'test.teacher@tutorfinder.dev', password: 'TestPass123!' };
const CONVERSATION_ID = process.argv[2] || 'c946716bdcd55c829';

const clientConfig = {
  apiKey: API_KEY,
  authDomain: 'tutor-platform-4e38f.web.app',
  projectId: 'tutor-platform-4e38f',
  storageBucket: 'tutor-platform-4e38f.firebasestorage.app',
  messagingSenderId: '529847709469',
  appId: '1:529847709469:web:0e0fdf05a938a09cecfbf4',
};

async function main() {
  const serverApp = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  const db = getAdminFirestore(serverApp, 'tutor'); // แอปใช้ named database 'tutor'

  const conv = await db.collection('conversations').doc(CONVERSATION_ID).get();
  if (!conv.exists) throw new Error(`ไม่พบ conversation ${CONVERSATION_ID}`);
  const { parentId, teacherId } = conv.data();
  console.log(`conversation ${CONVERSATION_ID}\n  parent: ${parentId}\n  teacher: ${teacherId}`);

  // ── 1) คู่สนทนา: client SDK ฟังสด (สิทธิ์ถูกตรวจด้วย Firestore rules ตัวจริง)
  const partyApp = initializeApp(clientConfig, 'party');
  await signInWithEmailAndPassword(getAuth(partyApp), PARENT.email, PARENT.password);
  const cdb = getFirestore(partyApp, 'tutor');

  let first = true;
  const seen = new Set();
  const startedAt = Date.now();
  let resolveHit;
  const hit = new Promise((resolve) => { resolveHit = resolve; });

  const unsubscribe = onSnapshot(
    query(
      collection(cdb, 'conversations', CONVERSATION_ID, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
    (snap) => {
      if (first) {
        first = false;
        snap.docs.forEach((d) => seen.add(d.id));
        console.log(`\n[1] initial snapshot: ${snap.docs.length} ข้อความ — client อ่านได้ตามกฎ ✓`);
        sendTeacherMessage().catch((e) => { console.error('send failed:', e.message); });
        return;
      }
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        console.log(`[2] push สดใน ${Date.now() - startedAt}ms: "${doc.data().text}" (${doc.data().senderRole})`);
        resolveHit(Date.now() - startedAt);
        return;
      }
    },
    (err) => { console.error('[1] listener error:', err.code || err.message); process.exit(1); },
  );

  async function sendTeacherMessage() {
    const custom = await serverApp.auth().createCustomToken(teacherId);
    const signedIn = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: API, Origin: API },
        body: JSON.stringify({ token: custom, returnSecureToken: true }),
      },
    ).then((r) => r.json());

    const session = await fetch(`${API}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: signedIn.idToken }),
    });
    const cookie = (session.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');

    const res = await fetch(`${API}/api/conversations/${CONVERSATION_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        clientMsgId: `rt${Date.now()}`,
        type: 'text',
        text: `ทดสอบ realtime ${new Date().toISOString().slice(11, 19)}`,
      }),
    });
    console.log(`[2] ครูส่งผ่าน API -> ${res.status}`);
  }

  const elapsed = await Promise.race([hit, new Promise((r) => setTimeout(() => r(null), 20000))]);
  unsubscribe();
  await deleteApp(partyApp);

  // ── 2) ไม่ใช่คู่สนทนา: ต้องถูกปฏิเสธ (fail-closed)
  const outsiderApp = initializeApp(clientConfig, 'outsider');
  await signInWithEmailAndPassword(getAuth(outsiderApp), OUTSIDER.email, OUTSIDER.password);
  const odb = getFirestore(outsiderApp, 'tutor');
  const denied = await new Promise((resolve) => {
    const stop = onSnapshot(
      query(collection(odb, 'conversations', CONVERSATION_ID, 'messages'), orderBy('createdAt', 'desc'), limit(10)),
      () => resolve(false),
      (err) => resolve(err.code),
    );
    setTimeout(() => { stop(); resolve('timeout'); }, 8000);
  });
  await deleteApp(outsiderApp);

  console.log(`\n[3] บัญชีนอกคู่สนทนา: ${denied === 'permission-denied' ? 'ถูกปฏิเสธ ✓ (fail-closed)' : `ผิดปกติ → ${denied}`}`);

  const ok = elapsed !== null && denied === 'permission-denied';
  console.log(ok
    ? `\n✅ ผ่าน — ข้อความจากอีกฝั่งเด้งเข้ามาใน ${elapsed}ms โดยไม่ refresh และคนนอกถูกปฏิเสธ`
    : '\n❌ ไม่ผ่าน');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
