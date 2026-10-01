// Pure validation helpers สำหรับ session report — แยกออกจาก session-report.ts
// เพื่อให้ node:test import ได้ตรง ๆ โดยไม่ดึง firebase-admin เข้ามา

export interface SanitizedReport {
  topicsCovered: string | null;
  homework: string | null;
  notes: string | null;
  score: number | null;
  error?: 'invalid_input';
}

export function sanitizeReportInput(report: {
  topicsCovered?: string;
  homework?: string;
  notes?: string;
  score?: number | string | null;
}): SanitizedReport {
  const topicsCovered = String(report.topicsCovered || '').trim().slice(0, 1000) || null;
  const homework = String(report.homework || '').trim().slice(0, 1000) || null;
  const notes = String(report.notes || '').trim().slice(0, 1000) || null;

  let score: number | null = null;
  const raw = report.score;
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { topicsCovered, homework, notes, score: null, error: 'invalid_input' };
    }
    score = n;
  }

  return { topicsCovered, homework, notes, score };
}

export function isReportEmpty(report: SanitizedReport): boolean {
  return report.topicsCovered === null
    && report.homework === null
    && report.notes === null
    && report.score === null;
}
