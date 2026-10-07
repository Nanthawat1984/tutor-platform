import Link from 'next/link';
import {
  ArrowLeft,
  GraduationCap,
  Headset,
  HelpCircle,
  Mail,
  MessageCircle,
  ClipboardList,
} from 'lucide-react';
import { getLineClientConfig } from '@/lib/line/config';

export const metadata = {
  title: 'ติดต่อทีมงาน — TutorFinder',
  description:
    'ช่องทางติดต่อทีมงาน TutorFinder ผ่าน LINE OA และอีเมล พร้อมข้อมูลที่ควรเตรียมเพื่อให้ได้รับคำตอบเร็วที่สุด',
  alternates: { canonical: '/support' },
};

const SUPPORT_EMAIL = 'support@tutorfinder.app';

const PREPARE_ITEMS = [
  'อีเมลที่ใช้สมัครบัญชี TutorFinder',
  'เลขที่การจองหรือรหัสอ้างอิงการชำระเงิน (ถ้ามี)',
  'ภาพหน้าจอของหน้าที่พบปัญหา เพื่อให้ทีมงานตรวจสอบได้เร็วขึ้น',
  'วันที่และเวลาที่เกิดปัญหา ประมาณก็ได้',
];

export default function SupportPage() {
  const { officialAccountId, addFriendUrl } = getLineClientConfig();

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
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-candy-sky shadow-card sticker">
            <Headset className="h-8 w-8 text-sky-600" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            ติดต่อทีมงาน
          </h1>
          <p className="mt-3 text-slate-600">
            ทีมงานพร้อมช่วยเรื่องการจอง การชำระเงิน และการใช้งานบัญชี
          </p>
        </div>

        <section className="space-y-5">
          <div className="glass-card p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-candy-mint">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">LINE OA (แนะนำ — เร็วที่สุด)</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  พิมพ์คำถามในแชท {officialAccountId} ได้เลย ทีมงานตอบกลับโดยทั่วไปภายใน 1 วันทำการ
                </p>
                {addFriendUrl && (
                  <a
                    href={addFriendUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-7 text-base font-semibold text-white shadow-button transition-all duration-200 hover:-translate-y-0.5 hover:from-pink-600 hover:to-rose-600"
                  >
                    <MessageCircle className="h-5 w-5" />
                    เปิดแชท LINE OA
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-candy-sun">
                <Mail className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">อีเมล</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  เหมาะกับเรื่องที่ต้องแนบเอกสารหรือรายละเอียดยาว
                </p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="mt-3 inline-block text-sm font-semibold text-pink-600 underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="glass-card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-pink-500" />
              <h2 className="font-display text-lg font-bold text-slate-900">
                เตรียมข้อมูลเหล่านี้ จะช่วยให้ได้คำตอบเร็วขึ้น
              </h2>
            </div>
            <ul className="mt-4 space-y-2">
              {PREPARE_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10 glass-card p-6 text-center sm:p-8">
          <p className="font-display text-lg font-bold text-slate-900">หาคำตอบด้วยตัวเองก่อนได้</p>
          <p className="mt-2 text-sm text-slate-600">
            ดูวิธีใช้งานและคำถามที่พบบ่อยได้ในหน้าช่วยเหลือ
          </p>
          <Link
            href="/help"
            className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-pink-200 bg-white/85 px-7 text-base font-semibold text-pink-600 shadow-card backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-pink-300 hover:bg-pink-50"
          >
            <HelpCircle className="h-5 w-5" />
            ไปที่หน้าช่วยเหลือ
          </Link>
        </section>

        <p className="mt-10 text-center text-sm text-slate-400">
          © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
        </p>
      </main>
    </div>
  );
}
