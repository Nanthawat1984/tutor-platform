/**
 * กฎหลักฐานการโอนสำหรับ payout ของครู
 *
 * ครูได้รับการแจ้งเตือนให้เปิดดูหลักฐานการโอนที่หน้ารายได้ ถ้าปิดรายการเป็น
 * 'โอนแล้ว' โดยไม่มีสลิปเลย ครูจะเปิดดูแล้วไม่เจออะไร จึงต้องบังคับให้แนบสลิป
 * ก่อน — ยกเว้นการส่งผ่าน Stripe Connect ที่มี transfer id เป็นหลักฐานแทน
 *
 * ค่าที่ส่งเข้ามาเป็นตัวระบุไฟล์ใน Firestore (path หรือ URL รุ่นเก่าก็ได้)
 * ขอแค่ตรวจว่ามีหลักฐานผูกกับรายการนี้อยู่แล้วหรือยัง
 */

export function isSlipRequiredForPaid(input: {
  /** สถานะใหม่ที่แอดมินเลือก */
  newStatus: string;
  /** รายการนี้ถูกส่งผ่าน Stripe Connect หรือไม่ */
  useConnect: boolean;
  /** หลักฐานที่แนบไว้ก่อนแล้วในเอกสาร payout */
  existingSlip?: string | null;
  /** หลักฐานใหม่ที่มากับฟอร์มในรอบนี้ */
  submittedSlip?: string | null;
}): boolean {
  if (input.newStatus !== 'paid') return false;
  if (input.useConnect) return false;
  return !(input.existingSlip || input.submittedSlip);
}