import Link from 'next/link';
import { ArrowLeft, FileText, GraduationCap } from 'lucide-react';
import { ServiceAgreementContent } from '@/components/legal/service-agreement-content';
import { TERMS_VERSION } from '@/lib/legal/consent';

export const metadata = {
  title: 'ข้อตกลงผู้ใช้บริการ — TutorFinder',
  description: 'ข้อตกลงผู้ใช้บริการของ TutorFinder แพลตฟอร์มการเรียนเสริม',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
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
            <FileText className="h-8 w-8 text-sky-600" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            ข้อตกลงผู้ใช้บริการ
          </h1>
          <p className="mt-3 text-slate-600">
            กรุณาอ่านและทำความเข้าใจก่อนสมัครและใช้บริการ TutorFinder
          </p>
          <p className="mt-2 text-sm text-slate-400">ฉบับ {TERMS_VERSION} · อัปเดตล่าสุด: 21 สิงหาคม 2026</p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <ServiceAgreementContent />
        </div>

        <p className="mt-10 text-center text-sm text-slate-400">
          © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
        </p>
      </main>
    </div>
  );
}
