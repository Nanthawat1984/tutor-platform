import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyLineWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;

  const expected = createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
