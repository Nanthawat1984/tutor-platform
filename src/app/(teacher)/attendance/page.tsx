import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Check, ClipboardCheck, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AttendanceStatusBadge } from '@/components/ui/badge';
import { formatTime } from '@/lib/utils';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const today = new Date().toISOString().split('T')[0];

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">เช็คชื่อ</h1>
          <p className="text-sm text-gray-500">บันทึกการเข้าเรียนของนักเรียน</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={selectedDate}
            className="rounded-lg border border-blue-200 px-3 py-2 text-sm" />
          <Button type="submit" size="sm" variant="outline">ดูวันที่</Button>
        </form>
      </div>

      {bookings.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <ClipboardCheck className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">ไม่มีเซสชันวันนี้</h3>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking: any) => (
            <Card key={booking.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{booking.studentName}</h3>
                    <AttendanceStatusBadge status="pending" />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {booking.courseTitle} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                  </p>
                </div>
                <div className="flex gap-2">
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
                      <Button type="submit" size="sm" variant={status === 'present' ? 'primary' : 'outline'}>
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
    </div>
  );
}


export const dynamic = 'force-dynamic';
