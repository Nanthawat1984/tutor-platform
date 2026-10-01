import { getLineServerConfig, requireLineServerConfig } from './config';

export class LineApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly responseCode?: string;

  constructor(status: number, retryable: boolean, responseCode?: string) {
    super(`LINE API request failed (${status}${responseCode ? `:${responseCode}` : ''})`);
    this.name = 'LineApiError';
    this.status = status;
    this.retryable = retryable;
    this.responseCode = responseCode;
  }
}

export type LineMessage = Record<string, unknown>;

// 400/404/410 = ผู้ใช้/คีย์ผิด หรือบล็อกบัญชีแล้ว → retry ไม่มีทางสำเร็จ ต้อง skip
// ที่เหลือ (429, 5xx, เครือข่าย) = transient → ควร retry
export function isPermanentLineFailure(status: number): boolean {
  return status === 400 || status === 404 || status === 410;
}

export async function pushLineMessages(lineUserId: string, messages: LineMessage[]): Promise<void> {
  const config = requireLineServerConfig();
  if (!config.enabled) return;

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });

  if (response.ok) return;

  let responseCode: string | undefined;
  try {
    const body = await response.json() as { message?: string; details?: Array<{ property?: string; message?: string }> };
    responseCode = body.message || body.details?.[0]?.message;
  } catch {
    // Keep API errors safe even when LINE returns non-JSON.
  }

  const permanentUserError = isPermanentLineFailure(response.status);
  throw new LineApiError(response.status, !permanentUserError, responseCode);
}

export async function replyLineMessages(replyToken: string, messages: LineMessage[]): Promise<void> {
  const config = requireLineServerConfig();
  if (!config.enabled) return;

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!response.ok) throw new LineApiError(response.status, response.status >= 500, 'reply_failed');
}

export function isLineEnabled(): boolean {
  return getLineServerConfig().enabled;
}
