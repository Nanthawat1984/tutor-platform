import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TutorFinder — แพลตฟอร์มเรียนเสริมพิเศษ',
    short_name: 'TutorFinder',
    description: 'ค้นหาครูพิเศษ จองเรียน ติดตามผลการเรียน ชำระเงิน ครบในที่เดียว',
    lang: 'th',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFF5F8',
    theme_color: '#EC4899',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
