type LineRole = 'parent' | 'teacher';

export async function assignLineRichMenu(lineUserId: string, role: LineRole): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const richMenuId = role === 'parent'
    ? process.env.LINE_RICH_MENU_PARENT_ID?.trim()
    : process.env.LINE_RICH_MENU_TEACHER_ID?.trim();
  if (!token || !richMenuId) return false;

  const response = await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`LINE rich menu assignment failed (${response.status})`);
  return true;
}
