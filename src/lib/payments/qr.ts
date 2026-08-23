// QR code helper — สร้าง QR data URL (server-side)
// ใช้ qrcode package (pure JS, ทำงานได้ทั้ง Node และ browser)
import QRCode from 'qrcode';

export async function generateQRDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  });
}

// PromptPay payload สำหรับ mock/demo
// ในโหมดจริงควรสร้าง EMVCo QR (มี CRC) จากบัญชีพร้อมเพย์ของแพลตฟอร์ม
// แต่สำหรับการทดสอบ flow เรา encode ข้อมูลอ้างอิงแทน
export function buildMockPromptPayPayload(opts: {
  ref: string;
  amount: number;
  number: string;
}): string {
  return [
    '000201',
    '010212',
    '29' + pad(String(opts.number.length)) + opts.number,
    '5303764',
    '54' + pad(String(opts.amount.toFixed(2).length)) + opts.amount.toFixed(2),
    '5802TH',
    '62' + pad(String(opts.ref.length)) + opts.ref,
    '6304',
    'MOCK-GATEWAY',
  ].join('');
}

function pad(v: string): string {
  return v.padStart(2, '0');
}
