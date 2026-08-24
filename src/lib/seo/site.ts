const FALLBACK_SITE_URL = 'https://tutorfinder.pilotai.space';

function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured || !/^https?:\/\//i.test(configured)) return FALLBACK_SITE_URL;
  return configured.replace(/\/+$/, '');
}

export const SITE_URL = getSiteUrl();

/**
 * Serialize JSON-LD without allowing user-controlled text to terminate the
 * surrounding script element and execute as HTML/JavaScript.
 */
export function serializeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? '')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
