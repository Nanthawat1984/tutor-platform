const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'public', 'line');
const roles = ['default', 'parent', 'teacher'];
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
// LINE API ไม่มีการอัปเดต definition ใน ID เดิม (PUT /v2/bot/richmenu/{id} → 405)
// การเปลี่ยน URL ปุ่มจึงต้อง "หมุน" เมนู: สร้างใหม่ + link default ให้ทุกคน แล้วเอา
// ID ใหม่ไปตั้งใน apphosting.yaml (--replace)
const replace = args.has('--replace');
// ผูก role menu ให้ผู้ใช้ที่เชื่อม LINE ไว้แล้ว (อ่านจาก Firestore) — ใช้หลัง --replace
const reassign = args.has('--reassign');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';

// ทุก tile เปิดผ่าน LIFF (https://liff.line.me/{liffId}{path}) เสมอ เพื่อให้อยู่
// ใน browser context เดียวกับตอน login เชื่อมบัญชี — session cookie จึงอยู่ครบ
// ทุกเมนู (URL ตรงแบบ {appUrl}{path} เปิดใน webview ปกติของ LINE ที่แยก cookie
// ออกจาก LIFF บน iOS ผู้ใช้ต้อง login ใหม่ทุกครั้งที่กด)
// ข้อกำหนด: LIFF endpoint ใน LINE Developers Console ต้องเป็น domain root
const actions = {
  default: ['/', '/help', '/', '/bookings', '/schedule', '/support'],
  parent: ['/bookings', '/my-bookings', '/progress', '/payments', '/my-profile', '/support'],
  teacher: ['/bookings', '/schedule', '/attendance', '/locations', '/earnings', '/support'],
};

function requireInputs() {
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is required');
  if (!liffId) throw new Error('NEXT_PUBLIC_LINE_LIFF_ID is required');
  for (const role of roles) {
    const image = path.join(assetDir, `rich-menu-${role}.png`);
    if (!fs.existsSync(image)) throw new Error(`Missing Rich Menu image: ${image}`);
  }
  if (!dryRun && !token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required unless --dry-run is used');
}

function payload(role) {
  return {
    size: { width: 2500, height: 1686 },
    selected: role === 'default',
    name: `TutorPlatform ${role}`,
    chatBarText: 'เปิดเมนู',
    areas: actions[role].map((target, index) => ({
      bounds: { x: (index % 3) * 833 + 18, y: Math.floor(index / 3) * 843 + 18, width: 797, height: 807 },
      action: { type: 'uri', uri: liffId ? `https://liff.line.me/${liffId}${target}` : `${appUrl}${target}` },
    })),
  };
}

async function lineJson(pathname, options = {}) {
  const response = await fetch(`https://api.line.me${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`LINE Rich Menu API failed (${response.status})`);
  return response.json();
}

async function createRole(role) {
  const envName = `LINE_RICH_MENU_${role.toUpperCase()}_ID`;
  const existingId = process.env[envName]?.trim();
  if (existingId && !replace) return existingId;
  const created = await lineJson('/v2/bot/richmenu', { method: 'POST', body: JSON.stringify(payload(role)) });
  const image = fs.readFileSync(path.join(assetDir, `rich-menu-${role}.png`));
  const upload = await fetch(`https://api-data.line.me/v2/bot/richmenu/${created.richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body: image,
  });
  if (!upload.ok) throw new Error(`LINE Rich Menu image upload failed (${upload.status})`);
  return created.richMenuId;
}

async function reassignRoleMenus(ids) {
  // ผู้ใช้ที่เชื่อม LINE ไว้แล้วถือ role menu ของ ID เก่า — ต้องผูกใหม่ให้ตรงบทบาท
  const admin = require('firebase-admin');
  const projectId = process.env.ADMIN_FIREBASE_PROJECT_ID?.trim() || 'tutor-platform-4e38f';
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL?.trim() || '';
  const privateKey = (process.env.ADMIN_FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('--reassign requires ADMIN_FIREBASE_CLIENT_EMAIL and ADMIN_FIREBASE_PRIVATE_KEY');
  }
  const app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  const db = admin.getFirestore(app, 'tutor');
  const snap = await db.collection('users').where('lineUserId', '!=', null).get();
  let linked = 0;
  for (const doc of snap.docs) {
    const { lineUserId, role } = doc.data();
    const menuId = role === 'parent' ? ids.parent : role === 'teacher' ? ids.teacher : '';
    if (!menuId || !lineUserId) continue;
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(menuId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      console.error(`reassign failed (role=${role}): HTTP ${response.status}`);
      continue;
    }
    linked += 1;
  }
  await app.delete().catch(() => {});
  console.log(JSON.stringify({ reassigned: linked }, null, 2));
}

async function main() {
  requireInputs();
  const payloads = Object.fromEntries(roles.map((role) => [role, payload(role)]));
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, roles, payloads }, null, 2));
    return;
  }

  const ids = {};
  for (const role of roles) ids[role] = await createRole(role);
  await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${ids.default}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => {
    if (!response.ok) throw new Error(`LINE default Rich Menu assignment failed (${response.status})`);
  });
  console.log(JSON.stringify({ richMenuIds: ids }, null, 2));
  if (reassign) await reassignRoleMenus(ids);
  if (replace) {
    console.log('next: put the new IDs in apphosting.yaml (LINE_RICH_MENU_*_ID) and redeploy');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
