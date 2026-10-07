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
// ลบเมนูรอบเก่าที่ค้างใน OA — จับเฉพาะเมนูที่สคริปต์นี้สร้างเอง (ชื่อ "TutorPlatform *")
// และเก็บไว้แค่ 3 ID ปัจจุบัน (จาก env หรือชุดที่เพิ่งสร้างเมื่อใช้คู่กับ --replace)
const prune = args.has('--prune');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';

// ทุก tile เปิดผ่าน LIFF (https://liff.line.me/{liffId}{path}) เสมอ เพื่อให้อยู่
// ใน browser context เดียวกับตอน login เชื่อมบัญชี — session cookie จึงอยู่ครบ
// ทุกเมนู (URL ตรงแบบ {appUrl}{path} เปิดใน webview ปกติของ LINE ที่แยก cookie
// ออกจาก LIFF บน iOS ผู้ใช้ต้อง login ใหม่ทุกครั้งที่กด)
// ข้อกำหนด: LIFF endpoint ใน LINE Developers Console ต้องเป็น domain root
const actions = {
  default: ['/', '/help', '/', '/bookings', '/dashboard', '/support'],
  parent: ['/bookings', '/dashboard', '/progress', '/payments', '/my-profile', '/support'],
  teacher: ['/bookings', '/schedule', '/attendance', '/locations', '/earnings', '/support'],
};

function requireInputs() {
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is required');
  if (!liffId) throw new Error('NEXT_PUBLIC_LINE_LIFF_ID is required');
  for (const role of roles) {
    const image = path.join(assetDir, `rich-menu-${role}.jpg`);
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
  // JPEG เพราะ LINE จำกัดรูปเมนูไม่เกิน 1MB — PNG ของดีไซน์นี้หนัก ~1.7MB
  // (ภาพถูกสร้างโดย scripts/build-line-rich-menu-assets.cjs ซึ่งบีบ ≤950KB ให้แล้ว)
  const image = fs.readFileSync(path.join(assetDir, `rich-menu-${role}.jpg`));
  if (image.length > 1_000_000) throw new Error(`Rich Menu image too large: rich-menu-${role}.jpg`);
  const upload = await fetch(`https://api-data.line.me/v2/bot/richmenu/${created.richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: image,
  });
  if (!upload.ok) throw new Error(`LINE Rich Menu image upload failed (${upload.status})`);
  return created.richMenuId;
}

async function reassignRoleMenus(ids) {
  // ผู้ใช้ที่เชื่อม LINE ไว้แล้วถือ role menu ของ ID เก่า — ต้องผูกใหม่ให้ตรงบทบาท
  // (firebase-admin v13 ต้อง import จาก subpath — admin.getFirestore ที่ root ไม่มีแล้ว)
  const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const projectId = process.env.ADMIN_FIREBASE_PROJECT_ID?.trim() || 'tutor-platform-4e38f';
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL?.trim() || '';
  const privateKey = (process.env.ADMIN_FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('--reassign requires ADMIN_FIREBASE_CLIENT_EMAIL and ADMIN_FIREBASE_PRIVATE_KEY');
  }
  const app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  const db = getFirestore(app, 'tutor');
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
  await deleteApp(app).catch(() => {});
  console.log(JSON.stringify({ reassigned: linked }, null, 2));
}

async function pruneStaleMenus(keeperIds) {
  // กันพลาด: ถ้า default ที่ผูกกับผู้ใช้ทุกคนไม่ใช่ชุดปัจจุบัน แปลว่า env เก่า/ไม่ตรง — หยุดก่อนลบ
  const bound = await lineJson('/v2/bot/user/all/richmenu');
  if (bound.richMenuId !== keeperIds.default) {
    throw new Error(
      `default rich menu (${bound.richMenuId}) is not the current keeper (${keeperIds.default}) — aborting prune`,
    );
  }
  const list = await lineJson('/v2/bot/richmenu/list');
  const keepers = new Set(Object.values(keeperIds));
  const stale = list.richmenus.filter(
    (menu) => /^TutorPlatform (default|parent|teacher)$/.test(menu.name) && !keepers.has(menu.richMenuId),
  );
  // ผู้ใช้ที่ยังผูกกับเมนูที่ถูกลบจะ fallback ไป default menu โดยอัตโนมัติ (LINE ตัดลิงก์ให้เอง)
  for (const menu of stale) {
    const response = await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`LINE Rich Menu delete failed (${response.status}) for ${menu.richMenuId}`);
    console.log(`pruned: ${menu.richMenuId} (${menu.name})`);
  }
  console.log(JSON.stringify({ pruned: stale.length }, null, 2));
}

async function main() {
  requireInputs();
  if (prune && !replace) {
    // ถ้าไม่มี ID ปัจจุบันใน env สคริปต์จะ "สร้างเมนูใหม่" แทนการ reuse — ไม่ปล่อยให้ --prune
    // เดินลูกนี้เพราะจะลบเมนูเก่าทั้งหมดแล้วเหลือชุดที่เพิ่งสร้างโดยไม่ตั้งใจ
    const missing = roles.filter((role) => !process.env[`LINE_RICH_MENU_${role.toUpperCase()}_ID`]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `--prune requires LINE_RICH_MENU_*_ID in env to know which menus to keep (missing: ${missing.join(', ')}); set them or run together with --replace`,
      );
    }
  }
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
  if (prune) await pruneStaleMenus(ids);
  if (replace) {
    console.log('next: put the new IDs in apphosting.yaml (LINE_RICH_MENU_*_ID) and redeploy');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
