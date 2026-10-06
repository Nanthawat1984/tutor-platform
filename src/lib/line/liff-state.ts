// จัดการ `liff.state` — query param ที่ LIFF ใช้เก็บ path จริงที่ผู้ใช้กดจาก Rich Menu
//
// ทุกลิงก์จาก LINE OA เปิดผ่าน https://liff.line.me/{liffId}{path} แต่ LIFF ไม่ได้
// เปิด path นั้นโดยตรง LINE จะ redirect ไปที่ "Endpoint URL" ที่ตั้งใน LINE
// Developers Console ก่อน (primary redirect) พร้อมยัด path ทั้งหมดไว้ใน `liff.state`
// แล้วค่อยย้ายไปหน้าจริง (secondary redirect) **ตอนที่เรียก `liff.init()` เท่านั้น**
// อ้างอิง: Opening a LIFF app → Behaviors from accessing the LIFF URL to opening
// the LIFF app (developers.line.biz)
//
// ถ้าไม่มีใครเรียก liff.init() ที่ primary redirect ผู้ใช้จะค้างอยู่ที่หน้า
// Endpoint URL ทุกครั้งที่กดเมนู (บั๊กจริง 6 ต.ค. 2026 — ทุก tile พาไปหน้า /my-profile)

/**
 * อ่าน path เป้าหมายจาก `liff.state`
 * คืน null เมื่อไม่มีค่า หรือค่าไม่ใช่ path ภายในโดเมนตัวเอง (กัน open redirect)
 */
export function getLiffStatePath(search: string): string | null {
  const raw = new URLSearchParams(search).get('liff.state');
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith('/')) return null;
  // `//host` และ `/\host` ถูกเบราว์เซอร์ตีความเป็น URL ข้ามโดเมนได้
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  if (/[\\\r\n]/.test(path)) return null;
  return path;
}

/**
 * หน้านี้คือ primary redirect ของ LIFF และต้องส่งต่อไปหน้าเมนูที่ผู้ใช้กดหรือไม่
 *
 * primary redirect คือ Endpoint URL ที่ตั้งใน Console — ถ้าตั้งเป็น domain root
 * (`https://host/`) หน้าแรกที่เจอจะเป็น `/` เสมอ และ secondary redirect จะลงที่
 * หน้าเมนูที่กดพอดี แต่ถ้า Endpoint ยังชี้ไปหน้าอื่น (เช่น `/my-profile`) โค้ดของ
 * LIFF จะต่อ path เข้าด้วยกันได้ URL ผิด (เช่น `/my-profile/my-bookings` → 404)
 * จึงต้องปล่อยหน้านั้นไว้ตามเดิม ห้าม init/redirect ที่นี่
 */
export function isLiffPrimaryRedirect(search: string, pathname: string): boolean {
  return pathname === '/' && getLiffStatePath(search) !== null;
}

const AUTH_RESPONSE_PARAMS = ['code', 'error', 'id_token', 'access_token'] as const;

/**
 * URL นี้กำลังพา auth response ของ LINE กลับมา (หลัง liff.login()) หรือไม่
 * ถ้าใช่ ห้าม redirect เองเพราะ `liff.init()` ต้องใช้ค่าเหล่านี้แลก token
 * ปล่อยให้หน้า login ที่มีอยู่แล้วจัดการเอง
 */
export function hasLineAuthResponse(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  if (AUTH_RESPONSE_PARAMS.some((key) => params.has(key))) return true;

  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.includes('=')) return false;
  const hashParams = new URLSearchParams(fragment);
  return AUTH_RESPONSE_PARAMS.some((key) => hashParams.has(key));
}
