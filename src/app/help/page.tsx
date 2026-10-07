import Link from 'next/link';
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  GraduationCap,
  HelpCircle,
  Link2,
  MessageCircle,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { getLineClientConfig } from '@/lib/line/config';

export const metadata = {
  title: 'ช่วยเหลือ — TutorFinder',
  description:
    'วิธีใช้งาน TutorFinder ตั้งแต่เชื่อมบัญชี LINE ค้นหาและจองครู ชำระค่าเรียน ไปจนถึงการรับแจ้งเตือน พร้อมคำถามที่พบบ่อย',
  alternates: { canonical: '/help' },
};

const MENU_GUIDE = [
  { icon: CalendarCheck, title: 'แดชบอร์ด', detail: 'ภาพรวมการเรียนของคุณ — คลาสที่จะถึง และสิ่งที่ต้องทำต่อ' },
  { icon: Search, title: 'การจองของฉัน', detail: 'ดูสถานะคำขอจองที่ส่งไปแล้วและตารางเรียนที่ยืนยันแล้ว' },
  { icon: Users, title: 'ผลการเข้าเรียน', detail: 'ติดตามผลการเข้าเรียนและความคืบหน้าของแต่ละคอร์ส' },
  { icon: Wallet, title: 'ค่าเรียน/ชำระเงิน', detail: 'ดูยอดค้างชำระ ประวัติการชำระ และอัปโหลดสลิปโอนเงิน' },
  { icon: Bell, title: 'ติดต่อทีมงาน', detail: 'เปิดช่องทางคุยกับทีมงานเมื่อต้องการความช่วยเหลือเพิ่มเติม' },
];

const FAQS = [
  {
    question: 'ไม่ได้รับแจ้งเตือนใน LINE',
    answer:
      'ตรวจว่าเพิ่มเพื่อน OA แล้ว และเชื่อมบัญชีเรียบร้อย จากนั้นเปิดการแจ้งเตือนได้ที่หน้าโปรไฟล์ (หัวข้อแจ้งเตือนผ่าน LINE OA) ถ้ายังไม่ได้รับ ให้กด "เชื่อมต่อใหม่" อีกครั้ง',
  },
  {
    question: 'กดเมนูแล้วระบบขอให้เข้าสู่ระบบ',
    answer:
      'เป็นเรื่องปกติสำหรับหน้าที่เกี่ยวกับข้อมูลส่วนตัว (แดชบอร์ด การจอง ค่าเรียน) ระบบต้องยืนยันตัวตนก่อน จึงจะแสดงข้อมูลของบัญชีคุณได้',
  },
  {
    question: 'ต้องการยกเลิกการเชื่อมต่อ LINE',
    answer:
      'ไปที่หน้าโปรไฟล์ หัวข้อแจ้งเตือนผ่าน LINE OA แล้วกด "ยกเลิกการเชื่อมต่อ" หรือปิดสวิตช์แจ้งเตือนถ้าแค่ต้องการพักการรับข้อความ',
  },
  {
    question: 'ลืมรหัสผ่านหรือเข้าสู่ระบบไม่ได้',
    answer:
      'ใช้ลิงก์ "ลืมรหัสผ่าน" ในหน้าเข้าสู่ระบบเพื่อตั้งรหัสใหม่ ถ้ายังเข้าไม่ได้ให้ติดต่อทีมงานพร้อมอีเมลที่ใช้สมัคร',
  },
];

export default function HelpPage() {
  const { officialAccountId, addFriendUrl } = getLineClientConfig();

  const steps = [
    {
      icon: MessageCircle,
      title: '1. เพิ่มเพื่อน LINE OA',
      detail: `เพิ่มเพื่อน ${officialAccountId} เพื่อรับแจ้งเตือนการจอง ค่าเรียน และข่าวสารจากทีมงาน`,
    },
    {
      icon: Link2,
      title: '2. เชื่อมบัญชีกับ LINE',
      detail:
        'กดปุ่ม "เริ่มเชื่อมบัญชี" ในเมนูแชท แล้วเข้าสู่ระบบด้วยบัญชี TutorFinder เพื่อผูก LINE กับบัญชีของคุณ',
    },
    {
      icon: Search,
      title: '3. ค้นหาและจองครู',
      detail: 'เลือกวิชา ระดับชั้น และช่วงเวลาที่สะดวก แล้วส่งคำขอจองให้ครูผู้สอน',
    },
    {
      icon: Wallet,
      title: '4. ชำระเงินและติดตามผล',
      detail:
        'ชำระค่าเรียน อัปโหลดสลิป และติดตามผลการเข้าเรียนได้จากแดชบอร์ดของคุณ',
    },
  ];

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
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-candy-lilac shadow-card sticker">
            <HelpCircle className="h-8 w-8 text-violet-600" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            ช่วยเหลือ
          </h1>
          <p className="mt-3 text-slate-600">
            คู่มือเริ่มต้นใช้งานและคำตอบสำหรับปัญหาที่พบบ่อย
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="font-display text-lg font-bold text-pink-600">เริ่มต้นใช้งานใน 4 ขั้น</h2>
          {steps.map((step) => (
            <div key={step.title} className="glass-card flex items-start gap-4 p-6 sm:p-7">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-candy-pink">
                <step.icon className="h-5 w-5 text-pink-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.detail}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-lg font-bold text-pink-600">เมนูใน LINE OA ใช้ทำอะไร</h2>
          <div className="glass-card divide-y divide-pink-50 p-2 sm:p-3">
            {MENU_GUIDE.map((item) => (
              <div key={item.title} className="flex items-start gap-3 p-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-pink-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            เมนูของครูผู้สอนจะแสดงรายการที่ใช้ในงานสอน เช่น ตารางสอน เช็คชื่อวันนี้ และรายได้
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-lg font-bold text-pink-600">คำถามที่พบบ่อย</h2>
          {FAQS.map((faq) => (
            <div key={faq.question} className="glass-card p-6 sm:p-7">
              <p className="font-semibold text-slate-900">{faq.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 glass-card p-6 text-center sm:p-8">
          <p className="font-display text-lg font-bold text-slate-900">ยังต้องการความช่วยเหลือ?</p>
          <p className="mt-2 text-sm text-slate-600">
            ทีมงานตอบกลับผ่าน LINE OA โดยทั่วไปภายใน 1 วันทำการ
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {addFriendUrl && (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-7 text-base font-semibold text-white shadow-button transition-all duration-200 hover:-translate-y-0.5 hover:from-pink-600 hover:to-rose-600"
              >
                <MessageCircle className="h-5 w-5" />
                เปิดแชท LINE OA {officialAccountId}
              </a>
            )}
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-pink-200 bg-white/85 px-7 text-base font-semibold text-pink-600 shadow-card backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-pink-300 hover:bg-pink-50"
            >
              ช่องทางติดต่อทีมงาน
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-slate-400">
          © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
        </p>
      </main>
    </div>
  );
}
