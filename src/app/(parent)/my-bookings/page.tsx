import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { BarChart3, CalendarDays, Search } from 'lucide-react';

export default async function ParentDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const parentId = 'temp-parent-id';

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('parentId', '==', parentId)
    .orderBy('bookingDate', 'desc')
    .limit(10)
    .get();

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 border-b border-blue-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 overflow-hidden px-4">
          <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-bold text-blue-700 sm:text-xl">TutorFinder</Link>
          <nav className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <Link href="/my-bookings" className="shrink-0 whitespace-nowrap rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">แดชบอร์ด</Link>
            <Link href="/explore" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">ค้นหาครู</Link>
            <Link href="/bookings" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">การจอง</Link>
            <Link href="/progress" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">ผลการเรียน</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-950">สวัสดี</h1>
        <p className="mt-1 text-slate-600">จัดการการเรียนเสริมของลูกคุณได้ที่นี่</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Link href="/explore" className="rounded-2xl bg-blue-600 p-6 text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700">
            <Search className="h-7 w-7" />
            <h3 className="mt-2 font-semibold">ค้นหาครู</h3>
            <p className="mt-1 text-sm text-blue-100">เลือกครูตามวิชา ระดับ และพื้นที่</p>
          </Link>
          <Link href="/bookings" className="rounded-2xl border border-blue-100/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur transition-shadow hover:shadow-md">
            <CalendarDays className="h-7 w-7 text-blue-600" />
            <h3 className="mt-2 font-semibold text-gray-900">ดูตารางเรียน</h3>
            <p className="mt-1 text-sm text-gray-500">เซสชันที่กำลังจะมาถึง</p>
          </Link>
          <Link href="/progress" className="rounded-2xl border border-blue-100/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur transition-shadow hover:shadow-md">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            <h3 className="mt-2 font-semibold text-gray-900">ผลการเรียน</h3>
            <p className="mt-1 text-sm text-gray-500">ติดตามความก้าวหน้า</p>
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-blue-100/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur">
          <h2 className="text-lg font-semibold">การจองล่าสุด</h2>
          {bookings.length === 0 ? (
            <div className="mt-4 text-center">
              <p className="text-gray-500">ยังไม่มีการจอง</p>
              <Link href="/explore" className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">เริ่มค้นหาครู</Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {bookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{b.studentName}</p>
                    <p className="text-sm text-gray-500">{b.courseTitle} • ครู{b.teacherName}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {b.status === 'confirmed' ? 'ยืนยันแล้ว' : 'รอยืนยัน'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


export const dynamic = 'force-dynamic';
