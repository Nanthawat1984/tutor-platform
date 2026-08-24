type UserRole = 'teacher' | 'parent' | 'admin' | undefined | null;

const DEFAULT_POST_LOGIN_PATH = '/my-bookings';
const PENDING_PROFILE_SETUP_KEY = 'tutorfinder:pending-profile-setup';

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

export function getPostRegistrationPath(role: UserRole) {
  return role === 'teacher' ? '/profile/edit' : '/my-profile';
}

export function markPendingProfileSetup() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_PROFILE_SETUP_KEY, '1');
  } catch {
    // Storage can be disabled; the registration flow still completes safely.
  }
}

export function consumePendingProfileSetup(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const pending = window.sessionStorage.getItem(PENDING_PROFILE_SETUP_KEY) === '1';
    if (pending) window.sessionStorage.removeItem(PENDING_PROFILE_SETUP_KEY);
    return pending;
  } catch {
    return false;
  }
}
