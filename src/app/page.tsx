import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';

const STATS = [
  { value: '2,400+', label: 'ครูพิเศษ' },
  { value: '18,000+', label: 'นักเรียน' },
  { value: '95%', label: 'ความพึงพอใจ' },
  { value: '120+', label: 'วิชาเรียน' },
];

const FEATURES = [
  {
    icon: Search,
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-200',
    title: 'ค้นหาครูง่าย',
    desc: 'กรองตามวิชา ระดับชั้น พื้นที่ และราคา อ่านรีวิวจากผู้ปกครองจริง ไม่มีค่าธรรมเนียมซ่อน',
    points: ['กรองตามวิชาและระดับชั้น', 'รีวิวจากผู้ปกครองจริง', 'เปรียบเทียบราคาได้ง่าย'],
  },
  {
    icon: CalendarCheck,
    gradient: 'from-indigo-500 to-blue-600',
    glow: 'shadow-indigo-200',
    title: 'จัดการครบในที่เดียว',
    desc: 'ตารางสอน การจอง การเช็คชื่อ ผลการเรียน — ทุกอย่างอยู่ในระบบเดียว ลดงาน admin ลง 80%',
    points: ['ตารางสอนอัตโนมัติ', 'เช็คชื่อเรียลไทม์', 'รายงานผลครบถ้วน'],
  },
  {
    icon: ShieldCheck,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-200',
    title: 'ชำระเงินปลอดภัย',
    desc: 'PromptPay QR / บัตรเครดิต / TrueMoney ระบบ escrow ปกป้องทั้งผู้ปกครองและครู',
    points: ['หลากหลายช่องทางชำระ', 'Escrow ปกป้องทุกฝ่าย', 'ใบเสร็จอัตโนมัติ'],
  },
];

const ROLES = [
  {
    icon: Users,
    role: 'ผู้ปกครอง',
    desc: 'ค้นหาครูที่เหมาะกับลูกหลาน ติดตามผลการเรียนแบบเรียลไทม์',
    href: '/register?role=parent',
    gradient: 'from-violet-600 to-purple-700',
    badge: 'สมัครฟรี',
  },
  {
    icon: GraduationCap,
    role: 'ครูพิเศษ',
    desc: 'เปิดคอร์สเรียน จัดการตารางสอน รับเงินตรงโดยไม่มีตัวกลาง',
    href: '/register?role=teacher',
    gradient: 'from-indigo-600 to-blue-700',
    badge: 'รับรายได้เพิ่ม',
  },
];

export default function HomePage() {
  return (
    <div className="app-shell">
      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-50 border-b border-violet-100/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-violet-700 tracking-tight">TutorFinder</span>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {['คอร์สเรียน', 'ครูพิเศษ', 'ราคา', 'เกี่ยวกับเรา'].map((item) => (
              <button
                key={item}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700 sm:inline-flex min-h-[40px] items-center"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-edu-gradient px-4 py-2 text-sm font-semibold text-white shadow-button transition-all hover:scale-[1.03] hover:shadow-elevated"
            >
              <Sparkles className="h-4 w-4" />
              <span className="sm:hidden">สมัคร</span>
              <span className="hidden sm:inline">เริ่มใช้งานฟรี</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        {/* Background decorations */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl" />
          <div className="absolute top-1/2 -left-32 h-80 w-80 rounded-full bg-indigo-300/15 blur-3xl" />
          <div className="absolute bottom-0 right-1/3 h-64 w-64 rounded-full bg-purple-200/20 blur-2xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          {/* Badge */}
          <div className="animate-fadeInUp mx-auto inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-white/70 px-5 py-2 text-sm font-semibold text-violet-700 shadow-card backdrop-blur">
            <Sparkles className="h-4 w-4 text-violet-500" />
            แพลตฟอร์มเรียนเสริมสำหรับครูและผู้ปกครอง
          </div>

          {/* Headline */}
          <h1 className="animate-fadeInUp delay-100 mx-auto mt-7 max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
            ค้นหา
            <span className="relative mx-3 inline-block edu-gradient-text">
              ครูพิเศษ
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                <path d="M2 8C60 2 140 2 198 8" stroke="url(#underline-grad)" strokeWidth="3" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="underline-grad" x1="0" y1="0" x2="200" y2="0">
                    <stop offset="0%" stopColor="rgb(124,58,237)"/>
                    <stop offset="100%" stopColor="rgb(139,92,246)"/>
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <br />
            <span className="text-slate-700">เรียนเสริม</span>
            <span className="edu-gradient-text ml-3">ง่ายๆ</span>
          </h1>

          <p className="animate-fadeInUp delay-200 mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            แพลตฟอร์มที่เชื่อมต่อผู้ปกครองกับครูเรียนเสริมคุณภาพ
            จัดการตารางสอน ติดตามผลการเรียน ชำระเงิน — ทุกอย่างในที่เดียว
          </p>

          {/* CTAs */}
          <div className="animate-fadeInUp delay-300 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-edu-gradient px-8 py-3.5 text-base font-bold text-white shadow-button transition-all hover:scale-[1.04] hover:shadow-elevated"
            >
              เริ่มใช้งานฟรี
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-violet-200 bg-white/80 px-8 py-3.5 text-base font-semibold text-violet-700 shadow-card backdrop-blur transition-all hover:bg-violet-50 hover:shadow-elevated"
            >
              <Search className="h-4 w-4" />
              ค้นหาครู
            </Link>
          </div>

          {/* Trust badges */}
          <div className="animate-fadeInUp delay-400 mt-10 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500">
            {['ฟรี ไม่มีค่าสมัคร', 'ปลอดภัย 100%', 'ครูผ่านการตรวจสอบ'].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="border-y border-violet-100/60 bg-white/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className={`text-center animate-fadeInUp delay-${(i + 1) * 100}`}
              >
                <p className="text-2xl font-extrabold edu-gradient-text sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="text-center">
          <span className="pill-badge-primary mb-4">ทำไมต้อง TutorFinder?</span>
          <h2 className="mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            ทุกอย่างที่คุณต้องการ<br />
            <span className="edu-gradient-text">ครบในที่เดียว</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            ออกแบบมาเพื่อนักการศึกษาไทย ใช้งานง่าย ตอบโจทย์ทั้งครูและผู้ปกครอง
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`glass-card p-7 animate-fadeInUp delay-${(i + 1) * 100}`}
              >
                <div className={`mb-5 inline-flex rounded-2xl bg-gradient-to-br ${f.gradient} p-3.5 shadow-lg ${f.glow}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{f.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-600 text-sm">{f.desc}</p>
                <ul className="mt-5 space-y-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ROLE CTA ── */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 p-1 shadow-elevated">
          <div className="rounded-[22px] bg-gradient-to-br from-violet-900/60 to-indigo-900/60 px-8 py-12 backdrop-blur sm:px-12 sm:py-16">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                พร้อมเริ่มต้นแล้วหรือยัง?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-violet-200">
                เลือกบทบาทของคุณแล้วเริ่มใช้งานได้ทันที ฟรี ไม่มีข้อผูกมัด
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {ROLES.map((r) => {
                const Icon = r.icon;
                return (
                  <Link
                    key={r.role}
                    href={r.href}
                    className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-7 backdrop-blur transition-all hover:bg-white/20 hover:scale-[1.02] hover:shadow-glow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`rounded-2xl bg-gradient-to-br ${r.gradient} p-3 shadow-lg`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-white">{r.role}</h3>
                          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                            {r.badge}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-violet-200 leading-relaxed">{r.desc}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-white">
                      สมัครเลย
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-violet-100/60 bg-white/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-edu-gradient">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="font-extrabold text-violet-700">TutorFinder</span>
            </div>
            <p className="text-sm text-slate-500">
              © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
            </p>
            <div className="flex items-center gap-1">
              {['นโยบายความเป็นส่วนตัว', 'ข้อกำหนด'].map((item) => (
                <button
                  key={item}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
