// AI study-help (P3 growth) — scoped homework explainer, NOT an open chatbot.
// A teacher generates a short Thai explanation + practice steps for ONE of
// their own session reports; the parent reads it on /progress. Scope guards:
//   - teacher owns the report (teacherId == session.uid)
//   - output is stored on the report doc (aiExplanation, aiGeneratedAt) so it
//     is generated once, reviewable, and never leaks across students
//   - fail-closed: no key / flag off / bad ownership → error, never partial data

export interface AiExplainInput {
  topicsCovered?: string | null;
  homework?: string | null;
  score?: number | null;
  notes?: string | null;
  studentLevel?: string | null;
  courseTitle?: string | null;
}

export interface AiExplainResult {
  explanation: string;
  practiceSteps: string[];
  model: string | null;
}

const MAX_INPUT_CHARS = 2000;

function truncate(value: string | null | undefined): string {
  return String(value || '').slice(0, MAX_INPUT_CHARS);
}

export function buildStudyHelpPrompt(input: AiExplainInput): string {
  return [
    'คุณคือผู้ช่วยครูสอนพิเศษ อธิบายเป็นภาษาไทย กระชับ อบอุ่น เหมาะกับผู้ปกครองและนักเรียน',
    `วิชา/คอร์ส: ${truncate(input.courseTitle) || 'ไม่ระบุ'}`,
    `ระดับชั้น: ${truncate(input.studentLevel) || 'ไม่ระบุ'}`,
    `เนื้อหาที่สอน: ${truncate(input.topicsCovered) || 'ไม่ระบุ'}`,
    `การบ้าน: ${truncate(input.homework) || 'ไม่ระบุ'}`,
    `คะแนน: ${input.score ?? 'ไม่ระบุ'}`,
    `บันทึกครู: ${truncate(input.notes) || 'ไม่มี'}`,
    'ตอบ JSON เท่านั้น: { "explanation": "อธิบายบทเรียน 3-5 ประโยค", "practiceSteps": ["ขั้นฝึก 1", "ขั้นฝึก 2", "ขั้นฝึก 3"] }',
    'ห้ามให้คำตอบการบ้านแบบลอกได้ทั้งข้อ ให้แนวคิดและขั้นตอนแทน',
  ].join('\n');
}

export async function generateStudyHelp(input: AiExplainInput): Promise<AiExplainResult> {
  const enabled = process.env.AI_STUDY_HELP_ENABLED === 'true';
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.AI_STUDY_HELP_MODEL?.trim() || 'gpt-4o-mini';
  if (!enabled) throw new Error('ai_study_help_disabled');
  if (!apiKey) throw new Error('ai_study_help_key_unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 600,
        input: [{ role: 'user', content: [{ type: 'input_text', text: buildStudyHelpPrompt(input) }] }],
      }),
    });
    if (!response.ok) throw new Error('ai_study_help_request_failed');
    const payload = await response.json().catch(() => null);
    const parts = Array.isArray(payload?.output)
      ? payload.output.flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      : [];
    const text = typeof payload?.output_text === 'string'
      ? payload.output_text
      : parts.find((p: any) => typeof p?.text === 'string')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('ai_study_help_invalid_output');
    const parsed = JSON.parse(match[0]);
    const explanation = String(parsed.explanation || '').slice(0, 1500);
    const practiceSteps = Array.isArray(parsed.practiceSteps)
      ? parsed.practiceSteps.filter((s: unknown): s is string => typeof s === 'string').slice(0, 5)
      : [];
    if (!explanation || practiceSteps.length === 0) throw new Error('ai_study_help_invalid_output');
    return { explanation, practiceSteps, model };
  } finally {
    clearTimeout(timeout);
  }
}
