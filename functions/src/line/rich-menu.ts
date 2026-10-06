export type RichMenuRole = 'default' | 'parent' | 'teacher';

import { getLineServerConfig } from './config';

export async function assignRoleRichMenu(lineUserId: string, role: 'parent' | 'teacher'): Promise<void> {
  const config = getLineServerConfig();
  const richMenuId = role === 'parent'
    ? process.env.LINE_RICH_MENU_PARENT_ID?.trim()
    : process.env.LINE_RICH_MENU_TEACHER_ID?.trim();
  if (!config.enabled || !config.channelAccessToken || !richMenuId) return;

  const response = await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.channelAccessToken}` },
  });
  if (!response.ok) throw new Error(`LINE role Rich Menu assignment failed (${response.status})`);
}

export function buildRichMenuPayload(role: RichMenuRole, appUrl: string, liffId: string) {
  // ทุก tile ต้องเปิดผ่าน LIFF (https://liff.line.me/{liffId}{path}) เสมอ —
  // LIFF เปิดใน browser context เดียวกับตอน login เชื่อมบัญชี session cookie
  // จึงอยู่ครบทุกเมนู ถ้าใช้ URL ตรงแบบ {appUrl}{path} จะเปิดใน webview ปกติ
  // ของ LINE ที่แยก cookie ออกจาก LIFF (ชัดเจนบน iOS) ผู้ใช้ต้องเชื่อมต่อใหม่
  // ทุกครั้งที่กด
  //
  // ข้อกำหนด: LIFF endpoint ใน LINE Developers Console ต้องตั้งเป็น domain root
  // (เช่น https://tutorfinder.pilotai.space/) เพราะ path หลัง liff.line.me ต้อง
  // อยู่ใต้ endpoint URL ถ้า endpoint ชี้ที่ /my-profile path อื่นจะถูกเมิน
  const paths = role === 'parent'
    ? ['/bookings', '/my-bookings', '/progress', '/payments', '/my-profile', '/support']
    : role === 'teacher'
      ? ['/bookings', '/schedule', '/attendance', '/locations', '/earnings', '/support']
      : ['/', '/help', '/', '/bookings', '/schedule', '/support'];
  const areas = paths.map((path, index) => ({
    bounds: {
      x: (index % 3) * 833 + 18,
      y: Math.floor(index / 3) * 843 + 18,
      width: 797,
      height: 807,
    },
    action: {
      type: 'uri',
      uri: liffId
        ? `https://liff.line.me/${liffId}${path}`
        : `${appUrl}${path}`,
    },
  }));

  return {
    size: { width: 2500, height: 1686 },
    selected: role === 'default',
    name: `TutorPlatform ${role}`,
    chatBarText: 'เปิดเมนู',
    areas,
  };
}
