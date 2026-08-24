type UserRole = 'teacher' | 'parent' | 'admin' | undefined | null;

const DEFAULT_POST_LOGIN_PATH = '/my-bookings';

/**
 * Accept only same-origin path redirects supplied by our middleware.
 * Absolute URLs and protocol-relative URLs would create an open redirect.
 */
export function getSafeRedirectPath(value: string | null | undefined, fallback = DEFAULT_POST_LOGIN_PATH) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;

  try {
    const url = new URL(value, 'https://tutorfinder.invalid');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function getPostLoginPath(role: UserRole) {
  if (role === 'teacher') return '/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/my-bookings';
}
