export type PasswordResetClassification = 'sent' | 'invalid_email' | 'rate_limited' | 'failed';

export function classifyPasswordResetError(error: unknown): PasswordResetClassification {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';

  if (code === 'auth/user-not-found') return 'sent';
  if (code === 'auth/invalid-email') return 'invalid_email';
  if (code === 'auth/too-many-requests') return 'rate_limited';
  return 'failed';
}
