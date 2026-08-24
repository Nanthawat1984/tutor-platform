import Link from 'next/link';
import { GraduationCap, Heart, ShieldCheck, ArrowLeft } from 'lucide-react';

const SECTIONS = [
  {
    title: '1. ข้อมูลที่เราเก็บ',
    points: [
      'ข้อมูลบัญชี: ชื่อ, อีเมล, เบอร์โทร, บทบาท (ผู้ปกครอง/ครู)',
      'ข้อมูลโปรไฟล์: วิชาที่สอน, ระดับชั้น, ประวัติการศึกษา',
      'ข้อมูลการใช้งาน: ตารางเรียน, การจอง, การชำระเงิน',
    ],
  },
  {
    title: '2. เราใช้ข้อมูลอย่างไร',
    points: [
      'เพื่อให้บริการค้นหาครูและการจองเรียน',
      'เพื่อจัดการตารางสอน การเช็คชื่อ และการติดตามผล',
      'เพื่อการชำระเงินและออกใบเสร็จ',
      'เพื่อปรับปรุงประสบการณ์การใช้งาน',
    ],
  },
  {
    title: '3. การปกป้องข้อมูล',
    points: [
      'ข้อมูลถูกเข้ารหัสระหว่างการส่งผ่าน (SSL/TLS)',
      'เราไม่ขายข้อมูลส่วนตัวของคุณให้บุคคลที่สาม',
      'คุณสามารถขอลบข้อมูลได้ตลอดเวลา',
    ],
  },
  {
    title: '4. การติดต่อเรา',
    points: [
      'หากมีคำถามเกี่ยวกับความเป็นส่วนตัว ติดต่อเราได้ที่ support@tutorfinder.app',
    ],
  },
];

export const metadata = {
  title: 'นโยบายความเป็นส่วนตัว — TutorFinder',
  description: 'นโยบายความเป็นส่วนตัวของ TutorFinder แพลตฟอร์มการเรียนเสริม',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="app-shell">
      <header className="sticky top-0 z-50 border-b-2 border-pink-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-pink-600">
              Tutor<span className="text-rose-400">Finder</span>
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-pink-50 hover:text-pink-600"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับหน้าหลัก
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-candy-mint shadow-card sticker">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            นโยบายความเป็นส่วนตัว
          </h1>
          <p className="mt-3 text-slate-600">
            เราให้ความสำคัญกับข้อมูลของคุณ <span className="inline-block animate-wiggle">💖</span>
          </p>
          <p className="mt-2 text-sm text-slate-400">อัปเดตล่าสุด: สิงหาคม 2026</p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="glass-card p-6 sm:p-7">
              <h2 className="font-display text-lg font-bold text-pink-600">{section.title}</h2>
              <ul className="mt-3 space-y-2">
                {section.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                    <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-400">
          © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
        </p>
      </main>
    </div>
  );
}
