import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';

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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold text-blue-600">TutorFinder</Link>
          <nav className="flex items-center gap-6">
            <Link href="/my-bookings" className="text-sm font-medium text-blue-600">แดชบอร์ด</Link>
            <Link href="/explore" className="text-sm font-medium text-gray-600">ค้นหาครู</Link>
            <Link href="/bookings" className="text-sm font-medium text-gray-600">การจอง</Link>
            <Link href="/progress" className="text-sm font-medium text-gray-600">ผลการเรียน</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">สวัสดี! 👋</h1>
        <p className="mt-1 text-gray-600">จัดการการเรียนเสริมของลูกคุณได้ที่นี่</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Link href="/explore" className="rounded-xl bg-blue-600 p-6 text-white shadow-sm hover:bg-blue-700">
            <div className="text-2xl">🔍</div>
            <h3 className="mt-2 font-semibold">ค้นหาครู</h3>
            <p className="mt-1 text-sm text-blue-100">เลือกครูตามวิชา ระดับ และพื้นที่</p>
          </Link>
          <Link href="/bookings" className="rounded-xl bg-white p-6 shadow-sm hover:shadow-md">
            <div className="text-2xl">📅</div>
            <h3 className="mt-2 font-semibold text-gray-900">ดูตารางเรียน</h3>
            <p className="mt-1 text-sm text-gray-500">เซสชันที่กำลังจะมาถึง</p>
          </Link>
          <Link href="/progress" className="rounded-xl bg-white p-6 shadow-sm hover:shadow-md">
            <div className="text-2xl">📊</div>
            <h3 className="mt-2 font-semibold text-gray-900">ผลการเรียน</h3>
            <p className="mt-1 text-sm text-gray-500">ติดตามความก้าวหน้า</p>
          </Link>
        </div>

        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
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
