import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { BookOpen, MessageCircle, Star, Users } from 'lucide-react';

export default async function TeacherDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';

  let upcomingBookings: any[] = [];
  let activeCourses = 0;
  let setupError = false;

  try {
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

    upcomingBookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    activeCourses = coursesSnap.size;
  } catch (error) {
    if ((error as { code?: number }).code !== 5) throw error;
    setupError = true;
  }

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 border-b border-blue-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 overflow-hidden px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-bold text-blue-700 sm:text-xl">TutorFinder</Link>
          <nav className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <Link href="/dashboard" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">แดชบอร์ด</Link>
            <Link href="/courses" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">คอร์สเรียน</Link>
            <Link href="/schedule" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">ตารางสอน</Link>
            <Link href="/attendance" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">เช็คชื่อ</Link>
            <Link href="/earnings" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">รายได้</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {setupError ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            ยังเชื่อมต่อ Cloud Firestore ไม่สำเร็จ กรุณาตรวจว่าเปิดใช้งาน Firestore database ใน Firebase project แล้ว
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'นักเรียนทั้งหมด', value: 0, icon: Users },
            { label: 'คอร์สที่เปิดสอน', value: activeCourses, icon: BookOpen },
            { label: 'ค่าสอนเฉลี่ย', value: '0.0', icon: Star },
            { label: 'รีวิว', value: 0, icon: MessageCircle },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
            <div key={stat.label} className="rounded-2xl border border-blue-100/80 bg-white/85 p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                </div>
                <span className="rounded-2xl bg-blue-50 p-3 text-blue-600 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-100/80 bg-white/85 p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur sm:p-6">
            <h2 className="text-lg font-semibold">เซสชันวันนี้ / ถัดไป</h2>
            {upcomingBookings.length === 0 ? (
              <p className="mt-4 text-gray-500">ไม่มีเซสชันที่กำลังจะมาถึง</p>
            ) : (
              <div className="mt-4 space-y-3">
                {upcomingBookings.map((b: any) => (
                  <div key={b.id} className="responsive-card-row rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                    <div className="min-w-0">
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

          <div className="rounded-2xl border border-blue-100/80 bg-white/85 p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur sm:p-6">
            <h2 className="text-lg font-semibold">เช็คชื่อวันนี้</h2>
            <p className="mt-4 text-gray-500">ไม่มีการเช็คชื่อวันนี้</p>
          </div>
        </div>
      </main>
    </div>
  );
}


export const dynamic = 'force-dynamic';
