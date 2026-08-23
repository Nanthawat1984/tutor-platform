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
  const links = role === 'parent'
    ? ['/bookings', '/my-bookings', '/progress', '/payments', `https://liff.line.me/${liffId}`, '/support']
    : role === 'teacher'
      ? ['/bookings', '/schedule', '/attendance', '/locations', '/earnings', '/support']
      : [`https://liff.line.me/${liffId}`, '/help', '/', '/bookings', '/schedule', '/support'];
  const areas = links.map((uri, index) => ({
    bounds: {
      x: (index % 3) * 833 + 18,
      y: Math.floor(index / 3) * 843 + 18,
      width: 797,
      height: 807,
    },
    action: {
      type: 'uri',
      uri: uri.startsWith('http') ? uri : `${appUrl}${uri}`,
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
