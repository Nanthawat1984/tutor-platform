// Payment configuration — TutorPlatform
// Central config สำหรับระบบชำระเงิน (ทำงานทั้ง mock และ Omise จริง)

// ── ค่าบริการแพลตฟอร์ม (20% ของยอด/เซสชัน) ──
export const PLATFORM_FEE_RATE = 0.2;

export interface PaymentMethodInfo {
  id: 'stripe_checkout' | 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
  label: string;
  description: string;
  badge: string;
}

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    id: 'stripe_checkout',
    label: 'บัตร / พร้อมเพย์',
    description: 'ชำระผ่าน Stripe Checkout ที่ปลอดภัย',
    badge: 'Stripe ปลอดภัย',
  },
  {
    id: 'bank_transfer',
    label: 'โอนเงิน / แจ้งสลิป',
    description: 'โอนเข้าบัญชีแล้วอัปโหลดสลิป',
    badge: 'แจ้งสลิป',
  },
];

// ── PromptPay (สำหรับ mock / demo) ──
// ในโหมดจริงค่าจาก environment หรือตั้งค่าใน Firestore (settings)
export const PROMPTPAY_NUMBER = process.env.PROMPTPAY_NUMBER || '088-XXX-XXXX';
export const PROMPTPAY_OWNER = process.env.PROMPTPAY_OWNER || 'TutorFinder Co., Ltd.';

// ── บัญชีรับเงินสำหรับวิธี "โอนเงิน/แจ้งสลิป" ──
export const BANK_ACCOUNT = {
  bankName: process.env.BANK_ACCOUNT_NAME || 'ธนาคารกสิกรไทย',
  accountName: process.env.BANK_ACCOUNT_HOLDER || 'บริษัท TutorFinder จำกัด',
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || 'XXX-X-XXXXX-X',
};

// ── Gateway mode ──
// Stripe เปิดใช้งานเมื่อระบุ PAYMENT_PROVIDER=stripe และมี server key ครบ
// หากยังไม่มี key ระบบจะ fallback เป็น Mock เพื่อทดสอบ flow ได้โดยไม่หักเงินจริง
export type PaymentProvider = 'mock' | 'stripe';

function hasStripeSecretKey(value: string | undefined): boolean {
  return Boolean(value && /^(sk|rk)_(test|live)_/.test(value.trim()));
}

function hasStripeWebhookSecret(value: string | undefined): boolean {
  return Boolean(value && /^whsec_/.test(value.trim()));
}

export function getPaymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === 'stripe'
    && hasStripeSecretKey(process.env.STRIPE_SECRET_KEY)
    && hasStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET)
    ? 'stripe'
    : 'mock';
}

export const MOCK_MODE = getPaymentProvider() === 'mock';

export function getGatewayLabel(): string {
  return MOCK_MODE ? 'โหมดทดสอบ (Mock Gateway)' : 'Stripe';
}

// ── คำนวณค่าธรรมเนียม ──
export function computeFees(amount: number): { fees: number; netAmount: number } {
  const fees = Math.round(amount * PLATFORM_FEE_RATE);
  return { fees, netAmount: amount - fees };
}

export function generateRef(prefix = 'TF'): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${rand}`;
}
