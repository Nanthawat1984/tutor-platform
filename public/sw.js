// Minimal offline-first service worker (P3 big bet, no Workbox dependency).
// Strategy: network-first for navigation + API (fresh data when online),
// cache-first for static assets. Versioned cache so deploys invalidate cleanly.
const CACHE_VERSION = 'tutorfinder-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/', '/login', '/icon-192.png', '/manifest.webmanifest']).catch(() => undefined),
    ).then(() => (self as any).skipWaiting()),
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => (self as any).clients.claim()),
  );
});

self.addEventListener('fetch', (event: any) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API: network-first with cache fallback (stale data beats no data offline).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Static assets: cache-first.
  if (url.pathname.match(/\.(png|jpg|svg|css|js|woff2?)$/) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return res;
        }),
      ),
    );
  }
});
