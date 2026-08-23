export const TERMS_VERSION = '2026-08-21-v1';
export const PRIVACY_VERSION = '2026-08-21-v1';

export interface RegistrationConsent {
  termsVersion: typeof TERMS_VERSION;
  privacyVersion: typeof PRIVACY_VERSION;
}
