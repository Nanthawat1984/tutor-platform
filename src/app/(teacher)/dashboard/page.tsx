import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';

export default async function TeacherDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';

  const [bookingsSnap, coursesSnap] = await Promise.all([
    db.collection(COLLECTIONS.BOOKINGS)
      .where('teacherId', '==', teacherId)
      .where('status', '==', 'confirmed')
      .orderBy('bookingDate')
      .limit(5)
      .get(),
    db.collection(COLLECTIONS.COURSES)
      .where('teacherId', '==', teacherId)
      .where('isActive', '==', true)
      .get(),
  ]);

  const upcomingBookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const activeCourses = coursesSnap.size;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold text-blue-600">TutorFinder</Link>
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-blue-600">แดชบอร์ด</Link>
            <Link href="/courses" className="text-sm font-medium text-gray-600">คอร์สเรียน</Link>
            <Link href="/schedule" className="text-sm font-medium text-gray-600">ตารางสอน</Link>
            <Link href="/attendance" className="text-sm font-medium text-gray-600">เช็คชื่อ</Link>
            <Link href="/earnings" className="text-sm font-medium text-gray-600">รายได้</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'นักเรียนทั้งหมด', value: 0, icon: '👨‍🎓' },
            { label: 'คอร์สที่เปิดสอน', value: activeCourses, icon: '📚' },
            { label: 'ค่าสอนเฉลี่ย', value: '⭐ 0.0', icon: '⭐' },
            { label: 'รีวิว', value: 0, icon: '💬' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                </div>
                <span className="text-2xl">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">เซสชันวันนี้ / ถัดไป</h2>
            {upcomingBookings.length === 0 ? (
              <p className="mt-4 text-gray-500">ไม่มีเซสชันที่กำลังจะมาถึง</p>
            ) : (
              <div className="mt-4 space-y-3">
                {upcomingBookings.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="font-medium">{b.studentName}</p>
                      <p className="text-sm text-gray-500">{b.courseTitle} • {b.startTime}</p>
                    </div>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">เช็คชื่อวันนี้</h2>
            <p className="mt-4 text-gray-500">ไม่มีการเช็คชื่อวันนี้</p>
          </div>
        </div>
      </main>
    </div>
  );
}


export const dynamic = 'force-dynamic';
