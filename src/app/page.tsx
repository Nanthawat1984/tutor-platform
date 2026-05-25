import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-blue-600">TutorFinder</div>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              สมัครใช้งาน
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
          ค้นหาครูพิเศษ
          <span className="text-blue-600"> เรียนเสริม</span>
          <br />
          หลังเลิกเรียน
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          แพลตฟอร์มที่เชื่อมต่อผู้ปกครองกับครูเรียนเสริมคุณภาพ
          จัดการตารางสอน ติดตามผลการเรียน ชำระเงิน — ทุกอย่างในที่เดียว
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-blue-700"
          >
            เริ่มใช้งานฟรี
          </Link>
          <Link
            href="/explore"
            className="rounded-lg border border-gray-300 bg-white px-8 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
          >
            ค้นหาครู
          </Link>
        </div>
      </main>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-gray-900">ทำไมต้อง TutorFinder?</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              title: 'ค้นหาครูง่าย',
              desc: 'กรองตามวิชา ระดับชั้น พื้นที่ และราคา อ่านรีวิวจากผู้ปกครองจริง',
            },
            {
              title: 'จัดการครบจบ',
              desc: 'ตารางสอน การจอง การเข้าเรียน ผลการเรียน — ทุกอย่างในระบบเดียว',
            },
            {
              title: 'ชำระเงินปลอดภัย',
              desc: 'PromptPay QR / บัตรเครดิต / TrueMoney — escrow ปกป้องทั้งสองฝ่าย',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-3 text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
