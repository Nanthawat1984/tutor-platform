// ตัวช่วยจัดกลุ่มข้อความตามวันสำหรับห้องคุย

import { CHAT_ONLINE_WINDOW_MS } from '@/types/chat';

const THAI_DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ms: number): number {
  return startOfDay(ms);
}

export function isSameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b);
}

export function dayLabel(ms: number): string {
  const today = dayKey(Date.now());
  const day = dayKey(ms);
  if (day === today) return 'วันนี้';
  if (day === today - THAI_DAY_MS) return 'เมื่อวาน';
  return new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function lastSeenLabel(ms: number | null): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < CHAT_ONLINE_WINDOW_MS) return 'ออนไลน์';
  if (diff < 3_600_000) return `ออนไลน์เมื่อ ${Math.max(1, Math.round(diff / 60_000))} นาทีที่แล้ว`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `ออนไลน์เมื่อ ${hours} ชั่วโมงที่แล้ว`;
  return `ออนไลน์เมื่อ ${Math.round(hours / 24)} วันที่แล้ว`;
}

/** เวลาแบบย่อสำหรับรายการห้องคุย */
export function listTimeLabel(ms: number | null): string {
  if (!ms) return '';
  if (isSameDay(ms, Date.now())) {
    return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  if (isSameDay(ms, Date.now() - THAI_DAY_MS)) return 'เมื่อวาน';
  return new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
