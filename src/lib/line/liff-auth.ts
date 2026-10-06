// LIFF sign-in glue — ให้ผู้ใช้ที่เปิดแอปในเบราว์เซอร์ในแอป LINE เข้าสู่ระบบด้วย
// บัญชี LINE ของตัวเองได้ (แทน Google popup ที่ webview บล็อก)
//
// Flow:
//   1) Client: liff.init + liff.login (ถ้ายังไม่ login) → liff.getIDToken()
//   2) POST /api/line/auth พร้อม { idToken }
//   3) Server: ตรวจ ID token กับ LINE verify endpoint ด้วย LINE_LOGIN_CHANNEL_ID
//      (ใช้ verifyLineIdToken เดิม — ตรวจ iss/aud/exp และ channelId ครบ)
//   4) หา user ใน Firestore จาก lineUserId → ออก Firebase custom token
//   5) Client: signInWithCustomToken → session cookie ทำงานเหมือน login ปกติ

import { isLineWebview } from './liff-client';

export interface LiffSignInDecision {
  action: 'direct' | 'login' | 'not-liff';
}

/**
 * ตัดสินใจว่า client ควรเรียก `liff.getIDToken()` ได้เลย หรือต้องพาไปหน้า
 * login ของ LINE ก่อน (แล้ว LIFF จะ reload กลับมาเอง) หรือไม่ควรใช้ LIFF เลย
 */
export function decideLiffSignInAction(input: {
  inLineWebview: boolean;
  liffLoggedIn: boolean;
}): LiffSignInDecision {
  if (!input.inLineWebview) return { action: 'not-liff' };
  return input.liffLoggedIn ? { action: 'direct' } : { action: 'login' };
}

/**
 * ตรวจสถานะ LIFF ฝั่ง client แล้วคืน LIFF ID token
 * - คืน `null` เมื่อกำลังพาผู้ใช้ไปหน้า login ของ LINE (หน้าจะถูก reload กลับมา)
 * - throw เมื่อ LIFF ใช้ไม่ได้ (config หาย / ไม่ได้เปิดใน webview ของ LINE)
 */
export async function getLiffIdToken(liffId: string): Promise<string | null> {
  if (!liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID');
  const { default: liff } = await import('@line/liff');
  await liff.init({ liffId });
  const decision = decideLiffSignInAction({
    inLineWebview: isLineWebview(),
    liffLoggedIn: liff.isLoggedIn(),
  });
  if (decision.action === 'not-liff') {
    throw new Error('LIFF ใช้ได้เฉพาะในเบราว์เซอร์ของ LINE');
  }
  if (decision.action === 'login') {
    liff.login();
    return null;
  }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error('ไม่พบการเข้าสู่ระบบ LINE กรุณาลองอีกครั้ง');
  return idToken;
}
