import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

const notoSansThai = Noto_Sans_Thai({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['thai'],
  variable: '--font-noto-sans-thai',
});

export const metadata: Metadata = {
  title: 'TutorFinder — แพลตฟอร์มเรียนเสริมพิเศษ',
  description: 'ค้นหาครูพิเศษเรียนเสริมหลังเลิกเรียน สะดวก ปลอดภัย จัดการทุกอย่างในที่เดียว',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={`${notoSansThai.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
