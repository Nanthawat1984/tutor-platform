const ADMIN_LOGIN_ID = 'superadmin';
const ADMIN_AUTH_EMAIL = 'superadmin@tutorfinder.app';

export function normalizeLoginIdentifier(identifier: string): string {
  const normalized = identifier.trim();
  return normalized.toLowerCase() === ADMIN_LOGIN_ID ? ADMIN_AUTH_EMAIL : normalized;
}
