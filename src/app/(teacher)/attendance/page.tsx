import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Check, ClipboardCheck, GraduationCap, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AttendanceStatusBadge } from '@/components/ui/badge';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { formatTime } from '@/lib/utils';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';

const today = new Date().toISOString().split('T')[0];

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const params = await searchParams;
  const selectedDate = params.date || today;

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', teacherId)
    .where('bookingDate', '==', selectedDate)
    .where('status', 'in', ['confirmed', 'completed'])
    .orderBy('startTime')
    .get();

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  return (
    <DashboardLayout
      title="เช็คชื่อ"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="responsive-page-header mb-6">
        <p className="text-sm text-slate-500">บันทึกการเข้าเรียนของนักเรียน</p>
        <form method="get" className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="date" name="date" defaultValue={selectedDate}
            className="min-h-[44px] rounded-xl border border-pink-100 bg-white/90 px-3 py-2 text-base text-slate-900 shadow-inner-lg focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100/60 sm:text-sm" />
          <Button type="submit" size="sm" variant="outline" className="w-full sm:w-auto">ดูวันที่</Button>
        </form>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="ไม่มีเซสชันวันนี้"
          description="เลือกวันที่อื่นเพื่อดูตารางเช็คชื่อ"
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking: any) => (
            <Card key={booking.id}>
              <div className="responsive-card-row">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{booking.studentName}</h3>
                    {booking.studentLevel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-700">
                        <GraduationCap className="h-3 w-3" />
                        {booking.studentLevel}
                      </span>
                    )}
                    <AttendanceStatusBadge status="pending" />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {booking.courseTitle} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                  </p>
                </div>
                <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
                  {['present', 'absent', 'late'].map((status) => (
                    <form key={status} action={async () => {
                      'use server';
                      const dbRef = getServerDb();
                      if (!dbRef) return;
                      await dbRef.collection(COLLECTIONS.ATTENDANCE).add({
                        bookingId: booking.id,
                        courseId: booking.courseId,
                        teacherId,
                        studentName: booking.studentName,
                        sessionDate: selectedDate,
                        status,
                        checkInTime: status === 'present' ? FieldValue.serverTimestamp() : null,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                      });
                    }}>
                      <Button type="submit" size="sm" variant={status === 'present' ? 'primary' : 'outline'} className="w-full">
                        {status === 'present' ? <><Check className="h-4 w-4" /> มา</> :
                         status === 'absent' ? <><X className="h-4 w-4" /> ขาด</> :
                         <><Clock className="h-4 w-4" /> สาย</>}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
