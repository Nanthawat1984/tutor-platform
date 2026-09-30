// ตรวจสลิปโอนเงินซ้ำ — สัญญาณเตือนแอดมิน ไม่ใช่การตัดสินใจแทน
//
// เดิมมี auto-approve ที่อนุมัติเองเมื่อผ่านเกณฑ์ทั้งหมด แต่เกณฑ์ทุกข้อมาจาก
// LLM ที่อ่านรูปซึ่งผู้ใช้ควบคุมได้ → ใส่ข้อความในรูปให้ผ่านทุกเงื่อนไขพร้อมกันได้
// จึงถือเป็นช่องโกงเงินได้โดยตรง ยกเลิกไปแล้ว เหลือแค่การนับแฮชรูปเพื่อกรอง
// การอนุมัติทั้งหมดขึ้นกับแอดมิน (ดู src/app/api/payments/confirm/route.ts)
import { createHash } from 'node:crypto';

export function hashSlipBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** payment ที่ยัง "มีชีวิต" — สลิปของมันถือว่าถูกใช้งานอยู่ */
const ACTIVE_STATUSES = ['pending', 'awaiting_review', 'paid'];

/**
 * สลิปรูปนี้เคยถูกใช้กับรายการอื่นที่ยังไม่จบหรือไม่
 * @param docs ผลจาก payments where slipHash == hash (ไม่รวมรายการตัวเอง)
 */
export function isDuplicateSlip(
  docs: { id: string; data: () => { status?: unknown } | undefined }[],
  ownPaymentId: string,
): boolean {
  return docs.some((d) => {
    if (d.id === ownPaymentId) return false;
    const status = d.data()?.status;
    return typeof status === 'string' && ACTIVE_STATUSES.includes(status);
  });
}
