import Link from 'next/link';
import { ArrowRight, CalendarCheck, Search, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="app-shell">
      <header className="mx-auto max-w-7xl px-4 py-6">
        <nav className="flex items-center justify-between gap-3">
          <div className="shrink-0 whitespace-nowrap text-lg font-bold text-blue-700 sm:text-2xl">TutorFinder</div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 sm:px-4 sm:text-sm"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className="whitespace-nowrap rounded-xl bg-blue-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">สมัคร</span>
              <span className="hidden sm:inline">สมัครใช้งาน</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-16 text-center sm:pt-20">
        <div className="mx-auto inline-flex rounded-full border border-blue-100 bg-white/75 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
          แพลตฟอร์มเรียนเสริมสำหรับครูและผู้ปกครอง
        </div>
        <h1 className="mx-auto mt-6 max-w-4xl text-[2.35rem] font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl md:text-6xl">
          <span className="block">ค้นหาครูพิเศษ</span>
          <span className="block text-blue-600">เรียนเสริม</span>
          <span className="block">หลังเลิกเรียน</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl break-words text-base leading-8 text-slate-600 sm:text-lg">
          แพลตฟอร์มที่เชื่อมต่อผู้ปกครองกับครูเรียนเสริมคุณภาพ
          จัดการตารางสอน ติดตามผลการเรียน ชำระเงิน — ทุกอย่างในที่เดียว
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700"
          >
            เริ่มใช้งานฟรี <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-white/80 px-8 py-3 text-base font-semibold text-slate-700 shadow-sm transition-colors hover:bg-blue-50"
          >
            ค้นหาครู
          </Link>
        </div>
      </main>

      <section className="mx-auto max-w-7xl px-4 pb-20">
        <h2 className="text-center text-2xl font-bold text-slate-950 sm:text-3xl">ทำไมต้อง TutorFinder?</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Search,
              title: 'ค้นหาครูง่าย',
              desc: 'กรองตามวิชา ระดับชั้น พื้นที่ และราคา อ่านรีวิวจากผู้ปกครองจริง',
            },
            {
              icon: CalendarCheck,
              title: 'จัดการครบจบ',
              desc: 'ตารางสอน การจอง การเข้าเรียน ผลการเรียน — ทุกอย่างในระบบเดียว',
            },
            {
              icon: ShieldCheck,
              title: 'ชำระเงินปลอดภัย',
              desc: 'PromptPay QR / บัตรเครดิต / TrueMoney — escrow ปกป้องทั้งสองฝ่าย',
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
            <div key={f.title} className="rounded-2xl border border-blue-100/80 bg-white/85 p-8 text-left shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur">
              <div className="mb-5 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-600 ring-1 ring-blue-100">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-950">{f.title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{f.desc}</p>
            </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
