import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Clock, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PaymentFlow } from '@/components/booking/payment-flow';
import { getGatewayLabel } from '@/lib/payments/config';

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id: bookingId } = await params;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) redirect('/bookings');
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;

  if (booking.parentId !== session.uid) redirect('/bookings');
  if (booking.status !== 'pending') redirect('/bookings');

  const amount = Number(booking.totalPrice) || 0;

  return (
    <DashboardLayout
      title="ชำระเงิน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="mx-auto max-w-2xl">
        <p className="mb-6 text-sm text-slate-500">
          ชำระเงินเพื่อยืนยันการจองเรียน — ระบบ escrow ปกป้องทั้งผู้ปกครองและครู
        </p>

        {/* สรุปการจอง */}
        <Card className="mb-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 font-bold text-xl text-pink-700">
              {(booking.studentName?.[0] || 'น').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">{booking.courseTitle}</h2>
              <p className="text-sm text-gray-500">ครู{booking.teacherName} • {booking.studentName}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDate(booking.bookingDate, 'd MMMM yyyy')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                </span>
              </p>
            </div>
          </div>
        </Card>

        {/* สรุปยอด */}
        <Card className="mb-5">
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">ค่าคอร์ส ({booking.courseTitle})</span>
              <span className="font-semibold text-slate-800">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between border-t border-pink-100 pt-2.5">
              <span className="font-bold text-slate-900">ยอดชำระ</span>
              <span className="text-lg font-extrabold text-pink-700">{formatCurrency(amount)}</span>
            </div>
          </div>
        </Card>

        {/* Payment flow */}
        <Card>
          <PaymentFlow
            bookingId={bookingId}
            amount={amount}
            studentName={booking.studentName}
            courseTitle={booking.courseTitle}
          />
        </Card>

        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5" />
            ชำระเงินปลอดภัยผ่าน {getGatewayLabel()} • ข้อมูลถูกเข้ารหัส
          </p>
          <Link href="/bookings" className="text-xs font-bold text-pink-600 hover:underline">
            ← กลับไปหน้าการจอง
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
