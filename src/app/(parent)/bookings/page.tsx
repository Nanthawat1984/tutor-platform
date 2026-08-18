import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { BookingStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { CalendarDays, Clock } from 'lucide-react';
import { requireSessionUser } from '@/lib/auth/session';

export default async function BookingsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;

  const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('parentId', '==', parentId)
    .orderBy('bookingDate', 'desc')
    .get();

  const bookings = bookingsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const upcoming = bookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending');
  const past = bookings.filter((b: any) => b.status === 'completed' || b.status === 'cancelled');

  return (
    <DashboardLayout
      title="การจองเรียน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div>
        <h2 className="mb-4 text-lg font-bold text-slate-900">กำลังจะมาถึง / รอยืนยัน</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-7 w-7" />}
            title="ไม่มีการจองที่กำลังจะมาถึง"
            description="ค้นหาครูพิเศษและจองเรียนได้เลย"
            action={{ label: 'ค้นหาครู', href: '/explore' }}
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((b: any) => (
              <Card key={b.id} hoverable>
                <div className="responsive-card-row">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-gray-900">{b.studentName}</h3>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {b.courseTitle} • ครู{b.teacherName}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(b.bookingDate, 'd MMMM yyyy')}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatTime(b.startTime)} - {formatTime(b.endTime)}</span>
                    </p>
                  </div>
                  <div className="w-full text-left sm:w-auto sm:text-right">
                    <p className="font-semibold text-pink-700">{formatCurrency(b.totalPrice)}</p>
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
                        <Button type="submit" size="sm" variant="outline" className="mt-2 w-full border-rose-300 text-rose-600 sm:w-auto">
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
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-slate-900">ประวัติ</h2>
          <div className="space-y-2">
            {past.map((b: any) => (
              <Card key={b.id} className="opacity-75">
                <div className="responsive-card-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{b.studentName}</span>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-gray-500">
                      {b.courseTitle} • {formatDate(b.bookingDate, 'd MMM yyyy')}
                    </p>
                  </div>
                  {b.status === 'completed' && (
                    <Link href={`/bookings/${b.id}/review`} className="w-full sm:w-auto">
                      <Button size="sm" variant="outline" className="w-full sm:w-auto">รีวิว</Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
