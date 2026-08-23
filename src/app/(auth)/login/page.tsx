import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { BookOpen, CheckCircle2, GraduationCap, Star, Users } from 'lucide-react';

// force-dynamic — กันหน้า login ค้างที่ fallback "Loading..."
// (useSearchParams ใน client component + static prerender ทำให้บาง network
//  ไม่ได้รับข้อมูล swap-in หลัง hydration → ฟอร์มค้างตลอด)
export const dynamic = 'force-dynamic';

const FEATURES = [
  { icon: Users, text: 'ครูพิเศษกว่า 2,400 คน' },
  { icon: BookOpen, text: 'มากกว่า 120 วิชา' },
  { icon: Star, text: 'ความพึงพอใจ 95%' },
];

function LoginFormWrapper() {
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* ── LEFT PANEL: Brand ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-pink-600 via-rose-600 to-purple-700 p-10 lg:flex lg:w-[45%]">
        {/* Decorations */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-pink-400/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/20 blur-2xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="animate-bounce-soft flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur ring-2 ring-white/30">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tight text-white">TutorFinder</span>
        </div>

        {/* Center Content */}
        <div className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-pink-100 ring-2 ring-white/25">
            ✨ แพลตฟอร์มการศึกษาอันดับ 1
          </div>
          <h2 className="font-display text-4xl font-extrabold leading-tight text-white">
            เรียนเสริม<br />
            <span className="text-pink-200">ง่าย</span> เร็ว ดี<br />
            ในที่เดียว
          </h2>
          <p className="mt-4 max-w-xs leading-relaxed text-pink-100">
            เชื่อมต่อผู้ปกครองกับครูพิเศษคุณภาพ ติดตามผลและจัดการทุกอย่างครบจบ
          </p>

          <div className="mt-8 space-y-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.text} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-2 ring-white/25">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-pink-100">{f.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative rounded-3xl bg-white/15 p-5 ring-2 ring-white/20 backdrop-blur">
          <div className="flex gap-1 text-amber-300">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-pink-100">
            "ใช้งานง่ายมาก หาครูพิเศษให้ลูกได้ภายใน 10 นาที ครูมีคุณภาพและตรวจสอบประวัติแล้ว"
          </p>
          <div className="mt-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-300/50 text-sm font-bold text-white">
              ส
            </div>
            <div>
              <p className="text-sm font-bold text-white">คุณสมหญิง วิชาการ</p>
              <p className="text-xs text-pink-200">ผู้ปกครอง • กรุงเทพฯ</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Form ── */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md animate-pop-in">
          {/* Mobile Logo */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="mt-3 font-display text-2xl font-extrabold text-pink-600">TutorFinder</span>
          </div>

          <div className="mb-8 hidden lg:block">
            <h1 className="font-display text-3xl font-extrabold text-slate-900">
              ยินดีต้อนรับกลับ <span className="inline-block animate-wiggle">👋</span>
            </h1>
            <p className="mt-2 text-slate-500">เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
          </div>
          <div className="mb-8 text-center lg:hidden">
            <h1 className="font-display text-2xl font-extrabold text-slate-900">เข้าสู่ระบบ</h1>
            <p className="mt-2 text-slate-500">ยินดีต้อนรับกลับ</p>
          </div>

          <Suspense fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}>
            <LoginFormWrapper />
          </Suspense>

          <div className="mt-6 flex flex-col gap-2">
            {['ไม่มีค่าธรรมเนียม', 'ข้อมูลปลอดภัย 100%', 'ครูผ่านการตรวจสอบ'].map((t) => (
              <div key={t} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
