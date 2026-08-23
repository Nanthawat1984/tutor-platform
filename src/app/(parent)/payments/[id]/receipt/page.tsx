import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { Button } from '@/components/ui/button';
import PaymentReceipt from '@/components/parent/payment-receipt';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PAYMENT_METHODS } from '@/lib/payments/config';

function asDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { id } = await params;
  const paymentSnap = await db.collection(COLLECTIONS.PAYMENTS).doc(id).get();
  if (!paymentSnap.exists) return redirect('/payments');

  const payment = paymentSnap.data() as any;
  if (payment.parentId !== session.uid || !['paid', 'refunded'].includes(payment.status)) {
    return redirect('/payments');
  }

  const methodLabel = PAYMENT_METHODS.find((method) => method.id === payment.method)?.label
    || (payment.method === 'bank_transfer' ? 'โอนเงิน / สลิป' : 'ชำระเงิน');
  const paidDate = asDate(payment.paidAt);
  const parentSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const parent = parentSnap.exists ? parentSnap.data() as any : {};

  return (
    <DashboardLayout
      title="ใบเสร็จรับเงิน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 print:hidden">
          <Link href="/payments" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-pink-700">
            <ArrowLeft className="h-4 w-4" /> กลับประวัติการชำระเงิน
          </Link>
        </div>
        <PaymentReceipt
          reference={payment.receiptNumber || payment.transactionId || payment.id}
          courseTitle={payment.courseTitle}
          studentName={payment.studentName}
          methodLabel={methodLabel}
          amount={Number(payment.amount) || 0}
          paidDateLabel={paidDate ? formatDate(paidDate, 'd MMMM yyyy') : undefined}
          status={payment.status}
          buyerName={parent.displayName || session.displayName}
          buyerEmail={parent.email || session.email}
          buyerAddress={parent.address || ''}
        />
        <div className="mt-5 print:hidden">
          <Link href={`/bookings/${payment.bookingId}`}>
            <Button variant="outline">ดูรายละเอียดการจอง</Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
