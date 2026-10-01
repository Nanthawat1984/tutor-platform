export interface LineClientConfig {
  enabled: boolean;
  notificationsEnabled: boolean;
  officialAccountId: string;
  addFriendUrl: string;
  liffId: string;
}

export function getLineClientConfig(): LineClientConfig {
  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';
  const officialAccountId = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID?.trim() || '@966mqfzj';
  // โครงสร้าง add-friend ของ LINE คือ /R/ti/p/%40{basicId} โดย basicId ไม่มี @ นำหน้า
  const basicId = officialAccountId.replace(/^@/, '');
  const addFriendUrl = basicId
    ? `https://line.me/R/ti/p/%40${encodeURIComponent(basicId)}`
    : '';

  return {
    enabled: Boolean(liffId),
    // ประกาศ fail-closed ใน apphosting.yaml — ค่าว่างถือว่าปิด
    notificationsEnabled: process.env.NEXT_PUBLIC_LINE_NOTIFICATIONS_ENABLED === 'true',
    officialAccountId,
    addFriendUrl,
    liffId,
  };
}