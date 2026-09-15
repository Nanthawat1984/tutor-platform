'use client';

import { useEffect } from 'react';

// Registers /sw.js once (production only — never on localhost/emulator dev,
// where a stale worker would serve cached pages over fresh code).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
