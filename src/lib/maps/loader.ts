'use client';

// โหลด Google Maps JavaScript API ครั้งเดียว (lazy) พร้อม Places library
// ใช้ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY จาก .env.local

let loadPromise: Promise<typeof google.maps> | null = null;

export function getGoogleMapsApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

export function hasGoogleMapsKey(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Maps can only load in the browser'));
      return;
    }
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const key = getGoogleMapsApiKey();
    if (!key) {
      reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));
      return;
    }

    const callbackName = '__tutorfinderMapsCallback';
    (window as any)[callbackName] = () => {
      resolve(window.google.maps);
      delete (window as any)[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete (window as any)[callbackName];
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}