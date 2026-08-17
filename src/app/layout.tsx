import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TutorFinder — แพลตฟอร์มการเรียนเสริมพิเศษ',
  description: 'ค้นหาครูพิเศษเรียนเสริมหลังเลิกเรียน สะดวก ปลอดภัย จัดการทุกอย่างในที่เดียว',
  keywords: ['ครูพิเศษ', 'เรียนเสริม', 'ติวเตอร์', 'การศึกษา', 'tutor'],
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
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
