// Client-side LIFF/LINE webview helpers (browser only)
//
// ปุ่ม "เชื่อมต่อบัญชี" ใน LINE OA เปิด LIFF ซึ่งรันในเบราว์เซอร์ในแอป LINE
// webview นี้บล็อก OAuth popup ของ Google ทำให้ signInWithPopup ใช้ไม่ได้
// หน้า login ต้องพาผู้ใช้เข้าสู่ระบบด้วย LINE แทน

/**
 * ตรวจว่าหน้านี้ถูกเปิดในเบราว์เซอร์ในแอป LINE หรือไม่
 * UA ของ LINE in-app browser จะมี `Line/<major>.<minor>` ต่อท้ายเสมอ
 * (iOS: "...Version/17.5 Mobile/15E148 Safari/604.1 Line/13.2.0")
 * ใช้ case-sensitive เพราะ UA อื่นที่ลงท้ายด้วย "line/" ตัวเล็กไม่ควรโดนจับ
 */
export function isLineWebview(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  if (!ua) return false;
  return /\bLine\/\d+\.\d+/i.test(ua);
}
