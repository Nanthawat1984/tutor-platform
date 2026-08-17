const GOOGLE_REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

export type GoogleSignInMethod = 'popup' | 'redirect';

export function getPreferredGoogleSignInMethod(): GoogleSignInMethod {
  return 'popup';
}

export function isGoogleProviderUser(providerData: ReadonlyArray<{ providerId?: string | null }>) {
  return providerData.some((provider) => provider.providerId === 'google.com');
}

export function shouldFallbackToGoogleRedirect(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && GOOGLE_REDIRECT_FALLBACK_CODES.has(code);
}
