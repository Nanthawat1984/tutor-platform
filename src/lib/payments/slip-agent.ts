export type SlipAgentStatus = 'passed' | 'flagged' | 'unavailable';

export interface SlipAgentExtractedData {
  amount: number | null;
  reference: string | null;
  transferDate: string | null;
  recipientAccountLast4: string | null;
}

export interface SlipAgentResult {
  status: SlipAgentStatus;
  confidence: number | null;
  extracted: SlipAgentExtractedData;
  reasons: string[];
  model: string | null;
}

const EMPTY_EXTRACTED: SlipAgentExtractedData = {
  amount: null,
  reference: null,
  transferDate: null,
  recipientAccountLast4: null,
};

function unavailable(reason: string): SlipAgentResult {
  return {
    status: 'unavailable',
    confidence: null,
    extracted: EMPTY_EXTRACTED,
    reasons: [reason],
    model: null,
  };
}

function normalizeReference(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9ก-๙]/gi, '');
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = Array.isArray(payload?.output)
    ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    : [];
  return parts.find((part: any) => typeof part?.text === 'string')?.text || '';
}

function parseAgentJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function analyzePaymentSlip(input: {
  buffer: Buffer;
  mimeType: string;
  expectedAmount: number;
  expectedReference?: string | null;
}): Promise<SlipAgentResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.PAYMENT_SLIP_AGENT_MODEL?.trim() || 'gpt-4o-mini';
  if (process.env.PAYMENT_SLIP_AGENT_ENABLED !== 'true') return unavailable('agent_disabled');
  if (!apiKey) return unavailable('agent_key_unavailable');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType)) {
    return unavailable('unsupported_slip_format');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 500,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'ตรวจสลิปโอนเงินเพื่อคัดกรองเบื้องต้นเท่านั้น ห้ามสรุปว่าเงินเข้าจริงจากภาพเพียงอย่างเดียว',
                'ตอบ JSON เท่านั้นตาม schema ที่กำหนด',
                `ยอดที่ระบบคาดหวัง: ${input.expectedAmount} บาท`,
                `เลขอ้างอิงที่ระบบคาดหวัง: ${input.expectedReference || 'ไม่ระบุ'}`,
                'ถ้าข้อมูลอ่านไม่ชัด, ยอดไม่ตรง, เลขอ้างอิงไม่ตรง หรือสงสัยว่าภาพถูกแก้ไข ให้ recommendation เป็น flag',
                'schema: { recommendation: "pass"|"flag", confidence: number, amount: number|null, reference: string|null, transferDate: string|null, recipientAccountLast4: string|null, reasons: string[] }',
              ].join('\n'),
            },
            {
              type: 'input_image',
              image_url: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
              detail: 'high',
            },
          ],
        }],
      }),
    });

    if (!response.ok) return unavailable('agent_request_failed');
    const payload = await response.json();
    const parsed = parseAgentJson(extractOutputText(payload));
    if (!parsed) return unavailable('agent_invalid_output');

    const amount = typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) ? parsed.amount : null;
    const reference = typeof parsed.reference === 'string' ? parsed.reference : null;
    const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : null;
    const reasons: string[] = Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((value: unknown): value is string => typeof value === 'string').slice(0, 8)
      : [];
    const extracted: SlipAgentExtractedData = {
      amount,
      reference,
      transferDate: typeof parsed.transferDate === 'string' ? parsed.transferDate : null,
      recipientAccountLast4: typeof parsed.recipientAccountLast4 === 'string' ? parsed.recipientAccountLast4.slice(-4) : null,
    };

    const amountMatches = amount !== null && Math.abs(amount - input.expectedAmount) < 0.01;
    const expectedReference = normalizeReference(input.expectedReference);
    const referenceMatches = !expectedReference || normalizeReference(reference).includes(expectedReference);
    const modelPassed = parsed.recommendation === 'pass' && (confidence ?? 0) >= 0.9;
    const status: SlipAgentStatus = modelPassed && amountMatches && referenceMatches ? 'passed' : 'flagged';
    if (!amountMatches) reasons.push('amount_mismatch_or_unreadable');
    if (!referenceMatches) reasons.push('reference_mismatch_or_unreadable');
    if (status === 'passed') reasons.push('agent_precheck_passed_admin_verification_required');

    return { status, confidence, extracted, reasons: [...new Set(reasons)].slice(0, 8), model };
  } catch {
    return unavailable('agent_timeout_or_network_error');
  } finally {
    clearTimeout(timeout);
  }
}
