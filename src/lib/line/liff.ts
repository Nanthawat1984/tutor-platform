export class LineTokenVerificationError extends Error {
  readonly code = 'LINE_TOKEN_INVALID';

  constructor(message = 'LINE ID token is invalid') {
    super(message);
    this.name = 'LineTokenVerificationError';
  }
}

interface LineVerifyResponse {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  error?: string;
}

export async function verifyLineIdToken(
  idToken: string,
): Promise<{ lineUserId: string; channelId: string }> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (!channelId) throw new LineTokenVerificationError('LINE channel is not configured');

  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    cache: 'no-store',
  });

  if (!response.ok) throw new LineTokenVerificationError();

  const payload = await response.json() as LineVerifyResponse;
  const now = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== 'https://access.line.me' ||
    !payload.sub ||
    payload.aud !== channelId ||
    !payload.exp ||
    payload.exp <= now
  ) {
    throw new LineTokenVerificationError();
  }

  return { lineUserId: payload.sub, channelId: payload.aud };
}
