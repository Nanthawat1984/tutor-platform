import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { BookingStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export default async function BookingsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const parentId = 'temp-parent-id';

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('parentId', '==', parentId)
    .orderBy('bookingDate', 'desc')
    .get();

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const upcoming = bookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending');
  const past = bookings.filter((b: any) => b.status === 'completed' || b.status === 'cancelled');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">การจองเรียน</h1>
        <p className="text-sm text-gray-500">ดูประวัติและสถานะการจองเรียนของลูกคุณ</p>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">กำลังจะมาถึง / รอยืนยัน</h2>
        {upcoming.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-gray-500">ไม่มีการจองที่กำลังจะมาถึง</p>
            <Link href="/explore" className="mt-3 inline-block">
              <Button size="sm">ค้นหาครู</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b: any) => (
              <Card key={b.id}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900">{b.studentName}</h3>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {b.courseTitle} • ครู{b.teacherName}
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      📅 {formatDate(b.bookingDate, 'd MMMM yyyy')} • ⏰ {formatTime(b.startTime)} - {formatTime(b.endTime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-blue-600">{formatCurrency(b.totalPrice)}</p>
                    {b.status === 'pending' && (
                      <form action={async () => {
                        'use server';
                        const dbRef = getServerDb();
                        if (!dbRef) return;
                        await dbRef.collection(COLLECTIONS.BOOKINGS).doc(b.id).update({
                          status: 'cancelled',
                          updatedAt: FieldValue.serverTimestamp(),
                        });
                      }}>
                        <Button type="submit" size="sm" variant="outline" className="mt-2 border-red-300 text-red-600">
                          ยกเลิก
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">ประวัติ</h2>
          <div className="space-y-2">
            {past.map((b: any) => (
              <Card key={b.id} className="opacity-75">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{b.studentName}</span>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-gray-500">
                      {b.courseTitle} • {formatDate(b.bookingDate, 'd MMM yyyy')}
                    </p>
                  </div>
                  {b.status === 'completed' && (
                    <Link href={`/bookings/${b.id}/review`}>
                      <Button size="sm" variant="outline">รีวิว</Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export const dynamic = 'force-dynamic';
