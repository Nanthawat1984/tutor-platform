const FALLBACK_SITE_URL = 'https://tutorfinder.pilotai.space';

function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured || !/^https?:\/\//i.test(configured)) return FALLBACK_SITE_URL;
  return configured.replace(/\/+$/, '');
}

export const SITE_URL = getSiteUrl();
