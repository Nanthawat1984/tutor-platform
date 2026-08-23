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
  // App Hosting cannot serve Firebase's reserved /__/auth callback namespace.
  // Popup keeps the OAuth callback inside the opener and works with the
  // project's Firebase authDomain on both desktop and mobile browsers.
  return 'popup';
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
