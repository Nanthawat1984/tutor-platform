// Auto-approve สลิปโอนเงิน — นโยบายอนุมัติอัตโนมัติแบบ conservative
// อนุมัติเองเฉพาะเคสที่หลักฐานครบและเสี่ยงต่ำมาก นอกนั้นเข้าคิวแอดมินพร้อมป้ายสาเหตุ

import { createHash } from 'node:crypto';

export const AUTO_APPROVE_MIN_CONFIDENCE = 0.97;

export interface SlipEvidence {
  agentStatus: string | null;
  agentConfidence: number | null;
  extractedAmount: number | null;
  extractedReference: string | null;
  expectedAmount: number;
  expectedReference?: string | null;
  recipientMatchesCompany: boolean | null;
  duplicateSlip: boolean;
}

function normalizeReference(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9ก-๙]/gi, '');
}

export function hashSlipBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface AutoApproveDecision {
  approved: boolean;
  reasons: string[];
}

/**
 * เงื่อนไขอนุมัติอัตโนมัติ (ต้องผ่านทั้งหมด):
 * 1. agent แนะนำ pass + confidence ≥ 0.97
 * 2. ยอดตรงเป๊ะ + เลขอ้างอิงตรง (ถ้ามีให้เทียบ)
 * 3. บัญชีผู้รับตรงบริษัท (ถ้าอ่านได้ — ถ้าอ่านไม่ได้ไม่นับเป็น fail แต่ไม่ auto)
 * 4. รูปสลิปไม่เคยใช้กับรายการอื่น (กันสลิปวน)
 */
export function evaluateSlipAutoApprove(ev: SlipEvidence): AutoApproveDecision {
  const reasons: string[] = [];
  if (ev.agentStatus !== 'passed') {
    reasons.push(ev.agentStatus === 'unavailable' ? 'agent_unavailable' : 'agent_flagged');
    return { approved: false, reasons };
  }
  const confidence = Number(ev.agentConfidence) || 0;
  if (confidence < AUTO_APPROVE_MIN_CONFIDENCE) {
    reasons.push('low_confidence');
    return { approved: false, reasons };
  }
  const amountMatches =
    ev.extractedAmount !== null && Math.abs(ev.extractedAmount - ev.expectedAmount) < 0.01;
  if (!amountMatches) {
    reasons.push('amount_mismatch_or_unreadable');
    return { approved: false, reasons };
  }
  const expectedRef = normalizeReference(ev.expectedReference);
  const referenceMatches =
    !expectedRef || normalizeReference(ev.extractedReference).includes(expectedRef);
  if (!referenceMatches) {
    reasons.push('reference_mismatch_or_unreadable');
    return { approved: false, reasons };
  }
  if (ev.duplicateSlip) {
    reasons.push('duplicate_slip');
    return { approved: false, reasons };
  }
  // บัญชีผู้รับ: ถ้าอ่านได้ต้องตรงบริษัทเท่านั้น ถ้าอ่านไม่ได้ → ให้แอดมินดู
  if (ev.recipientMatchesCompany === false) {
    reasons.push('recipient_mismatch');
    return { approved: false, reasons };
  }
  if (ev.recipientMatchesCompany !== true) {
    reasons.push('recipient_unreadable');
    return { approved: false, reasons };
  }
  return { approved: true, reasons: ['auto_approved_policy_pass'] };
}
