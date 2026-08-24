import type { Metadata } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/seo/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'TutorFinder — แพลตฟอร์มการเรียนเสริมพิเศษ',
    template: '%s | TutorFinder',
  },
  description: 'ค้นหาครูพิเศษเรียนเสริมหลังเลิกเรียน สะดวก ปลอดภัย จัดการทุกอย่างในที่เดียว',
  keywords: ['ครูพิเศษ', 'เรียนเสริม', 'ติวเตอร์', 'การศึกษา', 'tutor'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: SITE_URL,
    siteName: 'TutorFinder',
    title: 'TutorFinder — แพลตฟอร์มการเรียนเสริมพิเศษ',
    description: 'ค้นหาครูพิเศษและคอร์สเรียนที่เหมาะกับคุณ จัดการทุกอย่างในที่เดียว',
  },
  twitter: {
    card: 'summary',
    title: 'TutorFinder — แพลตฟอร์มการเรียนเสริมพิเศษ',
    description: 'ค้นหาครูพิเศษและคอร์สเรียนที่เหมาะกับคุณ',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&family=Sarabun:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
