// =============================================
// LINE Messaging API Integration Stub
// Phase 2: LINE notifications
// =============================================

// LINE Notify — simple one-way notification
export async function sendLINENotify(accessToken: string, message: string): Promise<boolean> {
  try {
    const response = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ message }),
    });
    return response.ok;
  } catch (error) {
    console.error('LINE Notify error:', error);
    return false;
  }
}

// LINE Messaging API — two-way chat (requires channel)
export async function sendLINEMessage(
  channelAccessToken: string,
  userId: string,
  messages: Array<{ type: string; text: string }>
): Promise<boolean> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: userId,
        messages,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('LINE Messaging error:', error);
    return false;
  }
}

// LINE Webhook handler — verify signature + process events
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

export async function verifyLINEWebhook(req: NextRequest, channelSecret: string): Promise<boolean> {
  const signature = req.headers.get('x-line-signature');
  if (!signature) return false;

  const body = await req.text();
  const hash = createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  return signature === hash;
}

// Notification templates (Thai)
export const NotificationTemplates = {
  bookingConfirmed: (studentName: string, date: string, time: string) =>
    `✅ ยืนยันการจองเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}\nเวลา: ${time} น.\n\nกรุณามาตรงเวลานะคะ`,

  bookingCancelled: (studentName: string, date: string) =>
    `❌ ยกเลิกการจองเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}`,

  attendanceAlert: (studentName: string, status: string) =>
    `📋 แจ้งการเข้าเรียน\n\nนักเรียน: ${studentName}\nสถานะ: ${status === 'present' ? 'มาเรียน ✅' : status === 'absent' ? 'ขาดเรียน ❌' : 'มาสาย ⚠️'}`,

  sessionReport: (studentName: string, date: string) =>
    `📊 รายงานการเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}\n\nครูได้บันทึกผลการเรียนแล้ว กรุณาตรวจสอบในแอพ`,

  paymentSuccess: (studentName: string, amount: string) =>
    `💳 ชำระเงินสำเร็จ\n\nนักเรียน: ${studentName}\nจำนวน: ${amount} บาท\n\nการจองได้รับการยืนยันแล้ว`,

  reviewReceived: (rating: number) =>
    `⭐ ได้รับรีวิวใหม่\n\nคะแนน: ${'⭐'.repeat(rating)}\n\nขอบคุณสำหรับ feedback คะ`,
};
