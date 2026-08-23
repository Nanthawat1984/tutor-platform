const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'public', 'line');
const roles = ['default', 'parent', 'teacher'];
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';

const actions = {
  default: ['/', '/help', '/', '/bookings', '/schedule', '/support'],
  parent: ['/bookings', '/my-bookings', '/progress', '/payments', `https://liff.line.me/${liffId}`, '/support'],
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
      action: { type: 'uri', uri: target.startsWith('http') ? target : `${appUrl}${target}` },
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
  if (existingId) return existingId;
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
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
