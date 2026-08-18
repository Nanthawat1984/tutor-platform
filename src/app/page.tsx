import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  Heart,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import MobileMenu from '@/components/landing/mobile-menu';

const STATS = [
  { value: '2,400+', label: 'ครูพิเศษ', emoji: '🧑‍🏫' },
  { value: '18,000+', label: 'นักเรียน', emoji: '🎒' },
  { value: '95%', label: 'ความพึงพอใจ', emoji: '💖' },
  { value: '120+', label: 'วิชาเรียน', emoji: '📚' },
];

const FEATURES = [
  {
    icon: Search,
    color: 'bg-candy-pink text-pink-600',
    title: 'ค้นหาครูง่าย',
    desc: 'กรองตามวิชา ระดับชั้น พื้นที่ และราคา อ่านรีวิวจากผู้ปกครองจริง ไม่มีค่าธรรมเนียมซ่อน',
    points: ['กรองตามวิชาและระดับชั้น', 'รีวิวจากผู้ปกครองจริง', 'เปรียบเทียบราคาได้ง่าย'],
  },
  {
    icon: CalendarCheck,
    color: 'bg-candy-sky text-sky-600',
    title: 'จัดการครบในที่เดียว',
    desc: 'ตารางสอน การจอง การเช็คชื่อ ผลการเรียน — ทุกอย่างอยู่ในระบบเดียว ลดงาน admin ลง 80%',
    points: ['ตารางสอนอัตโนมัติ', 'เช็คชื่อเรียลไทม์', 'รายงานผลครบถ้วน'],
  },
  {
    icon: ShieldCheck,
    color: 'bg-candy-mint text-emerald-600',
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
    gradient: 'from-pink-500 to-rose-500',
    badge: 'สมัครฟรี',
    emoji: '👨‍👩‍👧',
  },
  {
    icon: GraduationCap,
    role: 'ครูพิเศษ',
    desc: 'เปิดคอร์สเรียน จัดการตารางสอน รับเงินตรงโดยไม่มีตัวกลาง',
    href: '/register?role=teacher',
    gradient: 'from-pink-500 to-rose-500',
    badge: 'รับรายได้เพิ่ม',
    emoji: '🧑‍🏫',
  },
];

/* ── Cute cartoon blob mascots ── */
function Mascot({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none">
      {/* body */}
      <ellipse cx="60" cy="74" rx="38" ry="34" fill="#FFC7E0" stroke="#fff" strokeWidth="4" />
      {/* ears */}
      <circle cx="34" cy="34" r="14" fill="#FFA1CD" stroke="#fff" strokeWidth="4" />
      <circle cx="86" cy="34" r="14" fill="#FFA1CD" stroke="#fff" strokeWidth="4" />
      {/* face */}
      <ellipse cx="60" cy="62" rx="30" ry="26" fill="#fff" />
      {/* eyes */}
      <circle cx="49" cy="58" r="5" fill="#3C2846" />
      <circle cx="71" cy="58" r="5" fill="#3C2846" />
      <circle cx="51" cy="56" r="1.8" fill="#fff" />
      <circle cx="73" cy="56" r="1.8" fill="#fff" />
      {/* blush */}
      <ellipse cx="40" cy="68" rx="5" ry="3" fill="#FFA1CD" opacity="0.7" />
      <ellipse cx="80" cy="68" rx="5" ry="3" fill="#FFA1CD" opacity="0.7" />
      {/* smile */}
      <path d="M50 74 Q60 84 70 74" stroke="#3C2846" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* sparkle */}
      <path d="M95 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#FDB068" />
    </svg>
  );
}

function StarSparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none">
      <path d="M20 2 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 z" fill="#FDB068" stroke="#fff" strokeWidth="2" />
      <circle cx="20" cy="20" r="3" fill="#fff" opacity="0.6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="app-shell">
      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-50 border-b-2 border-pink-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="animate-bounce-soft flex h-10 w-10 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-pink-600">
              Tutor<span className="text-rose-400">Finder</span>
            </span>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {[
              { label: 'คอร์สเรียน', href: '/explore' },
              { label: 'ครูพิเศษ', href: '/explore' },
              { label: 'ราคา', href: '#pricing' },
              { label: 'เกี่ยวกับเรา', href: '#features' },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-pink-50 hover:text-pink-600"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <MobileMenu />
            <Link
              href="/login"
              className="hidden min-h-[40px] items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-pink-50 hover:text-pink-600 sm:inline-flex"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl bg-edu-gradient px-4 py-2 text-sm font-semibold text-white shadow-button transition-all hover:scale-[1.05] hover:shadow-elevated active:translate-y-1"
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
        {/* Floating candy decorations */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-float absolute -top-24 -right-24 h-80 w-80 rounded-full bg-pink-200/40 blur-3xl" />
          <div className="animate-float delay-300 absolute top-1/3 -left-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="animate-float delay-500 absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-amber-100/50 blur-2xl" />
          <StarSparkle className="animate-sparkle absolute left-[8%] top-24 h-8 w-8" />
          <StarSparkle className="animate-sparkle delay-300 absolute right-[12%] top-40 h-6 w-6" />
          <StarSparkle className="animate-sparkle delay-500 absolute bottom-24 left-[20%] h-7 w-7" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
          {/* Badge */}
          <div className="animate-fadeInUp mx-auto inline-flex items-center gap-2 rounded-full border-2 border-pink-200 bg-white/80 px-5 py-2 text-sm font-semibold text-pink-600 shadow-card backdrop-blur">
            <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
            แพลตฟอร์มเรียนเสริมสำหรับครูและผู้ปกครอง
          </div>

          {/* Mascot + Headline */}
          <div className="relative mx-auto mt-6 flex max-w-4xl items-center justify-center gap-2">
            <Mascot className="animate-float hidden h-28 w-28 shrink-0 sm:block" />
            <h1 className="animate-fadeInUp delay-100 font-display text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
              ค้นหา
              <span className="relative mx-3 inline-block edu-gradient-text">
                ครูพิเศษ
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M2 8C60 2 140 2 198 8" stroke="#FF78B4" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
              <br />
              <span className="text-slate-700">เรียนสนุก</span>
              <span className="edu-gradient-text ml-3">ทุกวัน!</span>
            </h1>
          </div>

          <p className="animate-fadeInUp delay-200 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            แพลตฟอร์มที่เชื่อมต่อผู้ปกครองกับครูเรียนเสริมคุณภาพ
            จัดการตารางสอน ติดตามผลการเรียน ชำระเงิน — ทุกอย่างในที่เดียว
            <span className="ml-1 inline-block animate-wiggle">🎈</span>
          </p>

          {/* CTAs */}
          <div className="animate-fadeInUp delay-300 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-edu-gradient px-8 py-3.5 text-base font-bold text-white shadow-button transition-all hover:scale-[1.05] hover:shadow-elevated active:translate-y-1"
            >
              เริ่มใช้งานฟรี
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl border-2 border-pink-200 bg-white/80 px-8 py-3.5 text-base font-semibold text-pink-600 shadow-card backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-pink-50 hover:shadow-elevated"
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
      <section className="border-y-2 border-pink-100 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((stat, i) => (
              <div key={stat.label} className={`text-center animate-pop-in delay-${(i + 1) * 100}`}>
                <div className="text-3xl">{stat.emoji}</div>
                <p className="mt-1 text-2xl font-extrabold edu-gradient-text sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="text-center">
          <span className="pill-badge-primary mb-4">✨ ทำไมต้อง TutorFinder?</span>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            ทุกอย่างที่คุณต้องการ<br />
            <span className="edu-gradient-text">ครบในที่เดียว</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            ออกแบบมาเพื่อนักการศึกษาไทย ใช้งานง่าย ตอบโจทย์ทั้งครูและผู้ปกครอง
          </p>
        </div>

        <div className="mt-14 grid gap-7 md:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`glass-card p-7 animate-pop-in delay-${(i + 1) * 100}`}
              >
                <div className={`mb-5 inline-flex rounded-2xl ${f.color} p-4 shadow-card sticker`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                <ul className="mt-5 space-y-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-pink-500" />
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
      <section id="pricing" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="sticker overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-pink-500 via-rose-500 to-rose-600 p-1 shadow-elevated">
          <div className="rounded-[2.2rem] bg-gradient-to-br from-pink-900/50 to-rose-900/50 px-8 py-12 backdrop-blur sm:px-12 sm:py-16">
            <div className="text-center">
              <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
                พร้อมเริ่มต้นแล้วหรือยัง? <span className="inline-block animate-wiggle">🎉</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pink-200">
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
                    className="group relative overflow-hidden rounded-3xl border-2 border-white/30 bg-white/15 p-7 backdrop-blur transition-all hover:scale-[1.03] hover:bg-white/25 hover:shadow-glow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`rounded-2xl bg-gradient-to-br ${r.gradient} p-3 shadow-lg`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg font-bold text-white">
                            {r.role} <span className="text-lg">{r.emoji}</span>
                          </h3>
                          <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-semibold text-white">
                            {r.badge}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-pink-100">{r.desc}</p>
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
      <footer className="border-t-2 border-pink-100 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-edu-gradient">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="font-display font-extrabold text-pink-600">TutorFinder</span>
            </div>
            <p className="text-sm text-slate-500">
              © 2025 TutorFinder — แพลตฟอร์มการศึกษาไทย
            </p>
            <div className="flex items-center gap-1">
              {[
                { label: 'นโยบายความเป็นส่วนตัว', href: '/privacy' },
                { label: 'ข้อกำหนด', href: '/terms' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-pink-50 hover:text-pink-600"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
