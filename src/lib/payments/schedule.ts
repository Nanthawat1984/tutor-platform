// ─────────────────────────────────────────────
// รอบการโอนเงินให้ครู (รายสัปดาห์)
// - วันอังคาร: สรุปยอดที่ต้องโอน
// - วันพฤหัสบดี 17:00 เป็นต้นไป: โอนเงิน
// ─────────────────────────────────────────────

export const PAYOUT_SUMMARY_DAY = 2;   // 0=อาทิตย์ ... 2=อังคาร
export const PAYOUT_TRANSFER_DAY = 4;  // 4=พฤหัสบดี
export const PAYOUT_TRANSFER_TIME = '17:00';

const DAY_NAMES_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * วันโอนเงินถัดไป (พฤหัสบดี)
 * - ถ้าวันนี้เป็นพฤหัสบดีและยังไม่ผ่าน 17:00 → วันนี้
 * - ไม่เช่นนั้น → พฤหัสบดีถัดไป
 */
export function getNextTransferDate(now: Date = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay();
  const isThursday = day === PAYOUT_TRANSFER_DAY;
  const beforeCutoff = d.getHours() < 17 || (d.getHours() === 17 && d.getMinutes() === 0);

  let diff = (PAYOUT_TRANSFER_DAY - day + 7) % 7;
  if (diff === 0 && !beforeCutoff) diff = 7;

  d.setDate(d.getDate() + diff);
  d.setHours(17, 0, 0, 0);
  void isThursday;
  void beforeCutoff;
  return d;
}

/** ฟอร์แมตวันโอนแบบไทย เช่น "พฤหัสบดีที่ 27 ส.ค. 2569 เวลา 17:00 น." */
export function formatTransferDate(d: Date): string {
  const y = d.getFullYear() + 543;
  return `${DAY_NAMES_TH[d.getDay()]}ที่ ${d.getDate()} ${MONTHS_TH_SHORT[d.getMonth()]} ${y} เวลา ${PAYOUT_TRANSFER_TIME} น.`;
}
