// จัดการ `liff.state` — query param ที่ LIFF ใช้เก็บ path จริงที่ผู้ใช้กดจาก Rich Menu
//
// ทุกลิงก์จาก LINE OA เปิดผ่าน https://liff.line.me/{liffId}{path} แต่ LIFF ไม่ได้
// เปิด path นั้นโดยตรง LINE จะ redirect ไปที่ "Endpoint URL" ที่ตั้งใน LINE
// Developers Console ก่อน (primary redirect) พร้อมยัด path ทั้งหมดไว้ใน `liff.state`
// แล้วค่อยย้ายไปหน้าจริง (secondary redirect) **ตอนที่เรียก `liff.init()` เท่านั้น**
// อ้างอิง: Opening a LIFF app → Behaviors from accessing the LIFF URL to opening
// the LIFF app (developers.line.biz)
//
// ถ้าไม่มีใครย้ายผู้ใช้จาก primary redirect ไปหน้าจริง ผู้ใช้จะค้างอยู่ที่หน้า
// Endpoint URL ทุกครั้งที่กดเมนู (บั๊กจริง 6 ต.ค. 2026 — ทุก tile พาไปหน้า /my-profile)
//
// แนวทางของแอป: อ่านค่า `liff.state` เองแล้ว redirect ที่ฝั่ง server (middleware)
// แทนการปล่อยให้ LIFF SDK ย้ายหน้า เพราะ SDK จะต่อ path เข้ากับ Endpoint URL
// (endpoint `/my-profile` + `/payments` = `/my-profile/payments` → 404) — ค่าใน
// `liff.state` คือ path จริงที่ผู้ใช้กด จึงใช้ได้ไม่ว่า Console จะตั้ง Endpoint เป็นอะไร

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
  // เป้าหมายที่ยังมี liff.state อยู่ใน query จะทำให้ redirect วนซ้ำได้ — ปฏิเสธ
  if (path.includes('liff.state')) return null;
  return path;
}

/**
 * path ที่ต้อง redirect ทันทีฝั่ง server เมื่อ LIFF พามาที่ primary redirect
 * คืน null เมื่อไม่ควร redirect (ไม่มีค่า / เป็น URL ข้ามโดเมน / มี auth response
 * ของ LINE ที่ต้องให้ liff.init() แลกก่อน)
 *
 * เหตุผลที่อ่านค่าจาก `liff.state` เอง แทนที่จะให้ LIFF SDK ย้ายหน้า: LIFF จะต่อ path
 * เข้ากับ Endpoint URL ใน Console (เช่น endpoint `/my-profile` + `/payments`
 * = `/my-profile/payments` ที่ไม่มีหน้านี้) — ค่าใน `liff.state` คือ path จริง
 * ที่ผู้ใช้กดจึงตรงกว่าและใช้ได้ไม่ว่า Endpoint จะตั้งเป็นอะไร
 */
export function getLiffStateRedirect(search: string): string | null {
  // auth code/token ต้องถูกแลกด้วย liff.init() ก่อน — ห้าม redirect ทิ้ง
  if (hasLineAuthResponse(search, '')) return null;
  return getLiffStatePath(search);
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
