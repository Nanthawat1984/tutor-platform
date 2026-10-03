// ตรรกะตัดสินใจว่าจะสร้าง/ใช้/รอ consent เมื่อผู้ใช้เข้าสู่ระบบ
//
// ข้อบังคับ: ห้ามเรียก POST /api/auth/profile เพื่อ "สร้างโปรไฟล์ใหม่" โดยไม่มี consent
// เพราะเซิร์ฟเวอร์จะตอบ 400 consent_required และผู้ใช้จะล็อกอินไม่ได้ไปตลอด

export type ProfileAction =
  | 'reuse'        // มีโปรไฟล์อยู่แล้ว ใช้ตัวเดิม
  | 'create'       // ยังไม่มีโปรไฟล์ แต่มี consent ที่ผู้ใช้ยอมรับแล้ว → สร้างได้
  | 'await-consent'; // ยังไม่มีโปรไฟล์และไม่มี consent → ต้องให้ผู้ใช้ยอมรับก่อน

export function resolveProfileAction(input: {
  existingProfile: unknown | null | undefined;
  hasConsent: boolean;
}): ProfileAction {
  if (input.existingProfile) return 'reuse';
  return input.hasConsent ? 'create' : 'await-consent';
}

/**
 * ผู้ใช้ที่ล็อกอินผ่าน Firebase Auth แล้ว แต่ยังไม่มีโปรไฟล์ใน Firestore
 * ต้องถูกพาไปกรอกบทบาท + ยอมรับข้อตกลงก่อน จึงจะใช้งานระบบได้
 */
export function needsProfileSetup(input: {
  signedIn: boolean;
  loading: boolean;
  profile: unknown | null | undefined;
}): boolean {
  return input.signedIn && !input.loading && !input.profile;
}