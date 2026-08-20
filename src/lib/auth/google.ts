const GOOGLE_REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

export type GoogleSignInMethod = 'popup' | 'redirect';

export class GooglePopupTimeoutError extends Error {
  constructor() {
    super('กรุณาเลือกบัญชี Google ภายใน 30 วินาที ระบบจะเปลี่ยนเป็นวิธีล็อกอินอื่นค่ะ');
    this.name = 'GooglePopupTimeoutError';
  }
}

export function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(
    navigator.userAgent
  );
}

export function getPreferredGoogleSignInMethod(): GoogleSignInMethod {
  // Desktop: popup gives a smoother experience (no full-page redirect) and
  // returns the result directly via window.opener.postMessage.
  // Mobile: redirect works in ALL mobile browsers including in-app browsers
  // (LINE, Facebook, etc.) that block popups. The redirect flow is now
  // same-origin (authDomain === app domain) so it completes reliably.
  return isMobile() ? 'redirect' : 'popup';
}

export function isGoogleProviderUser(providerData: ReadonlyArray<{ providerId?: string | null }>) {
  return providerData.some((provider) => provider.providerId === 'google.com');
}

export function shouldFallbackToGoogleRedirect(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && GOOGLE_REDIRECT_FALLBACK_CODES.has(code)) return true;
  if (error instanceof GooglePopupTimeoutError) return true;
  return false;
}
