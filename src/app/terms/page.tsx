import Link from 'next/link';
import { GraduationCap, FileText, CheckCircle2, ArrowLeft } from 'lucide-react';

const SECTIONS = [
  {
    title: '1. การใช้บริการ',
    points: [
      'TutorFinder เป็นแพลตฟอร์มเชื่อมต่อผู้ปกครองกับครูเรียนเสริม',
      'ผู้ใช้ต้องมีอายุ 18 ปีขึ้นไป หรืออยู่ภายใต้การดูแลของผู้ปกครอง',
      'ข้อมูลที่ให้ไว้ต้องเป็นความจริงและถูกต้อง',
    ],
  },
  {
    title: '2. บทบาทของครู',
    points: [
      'ครูต้องให้ข้อมูลการศึกษาและประสบการณ์ที่ถูกต้อง',
      'ครูต้องจัดการตารางสอนตามที่ตกลงไว้กับนักเรียน',
      'การยกเลิกคาบเรียนควรแจ้งล่วงหน้าตามนโยบายของแพลตฟอร์ม',
    ],
  },
  {
    title: '3. การชำระเงิน',
    points: [
      'การชำระเงินทำผ่านระบบ escrow เพื่อปกป้องทั้งสองฝ่าย',
      'เงินจะปล่อยให้ครูหลังคาบเรียนเสร็จสมบูรณ์',
      'ค่าธรรมเนียมแพลตฟอร์มจะแสดงอย่างชัดเจนก่อนชำระ',
    ],
  },
  {
    title: '4. การระงับบัญชี',
    points: [
      'เราขอสงวนสิทธิ์ระงับบัญชีที่ละเมิดข้อกำหนดหรือก่อให้เกิดความเสียหาย',
      'ผู้ใช้สามารถลบบัญชีได้ตลอดเวลาผ่านหน้าตั้งค่า',
    ],
  },
];

export const metadata = {
  title: 'ข้อกำหนดการใช้งาน — TutorFinder',
  description: 'ข้อกำหนดการใช้งานของ TutorFinder แพลตฟอร์มการเรียนเสริม',
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
            ข้อกำหนดการใช้งาน
          </h1>
          <p className="mt-3 text-slate-600">
            กฎกติกาที่ช่วยให้ทุกคนเรียนสนุกและปลอดภัย <span className="inline-block animate-wiggle">📚</span>
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
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
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
