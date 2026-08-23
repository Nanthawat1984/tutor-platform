import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Receipt, ReceiptText, CalendarDays, QrCode, CreditCard, Smartphone, Landmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { PaymentStatusBadge } from '@/components/ui/badge';
import { PAYMENT_METHODS } from '@/lib/payments/config';

function methodIcon(method: string) {
  switch (method) {
    case 'stripe_checkout': return <CreditCard className="h-4 w-4" />;
    case 'promptpay': return <QrCode className="h-4 w-4" />;
    case 'credit_card': return <CreditCard className="h-4 w-4" />;
    case 'truemoney': return <Smartphone className="h-4 w-4" />;
    case 'bank_transfer': return <Landmark className="h-4 w-4" />;
    default: return <Receipt className="h-4 w-4" />;
  }
}

function methodLabel(method: string) {
  const legacyLabels: Record<string, string> = {
    promptpay: 'พร้อมเพย์',
    credit_card: 'บัตรเครดิต / เดบิต',
    truemoney: 'TrueMoney (รายการเดิม)',
    bank_transfer: 'โอนเงิน / สลิป',
  };
  return PAYMENT_METHODS.find((m) => m.id === method)?.label || legacyLabels[method] || method;
}

export default async function PaymentsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('parentId', '==', parentId)
    .limit(100)
    .get();

  // Sort in memory to avoid requiring a composite index (parentId + createdAt).
  const payments = paymentsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

  return (
    <DashboardLayout
      title="การชำระเงิน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">ประวัติการชำระเงินและใบเสร็จของคุณ</p>

      {payments.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-7 w-7" />}
          title="ยังไม่มีรายการชำระเงิน"
          description="เมื่อคุณจองเรียนและชำระเงิน รายการจะแสดงที่นี่"
          action={{ label: 'ค้นหาครู', href: '/explore' }}
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p: any) => (
            <Card key={p.id}>
              <div className="responsive-card-row">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                      {methodIcon(p.method)}
                    </span>
                    <span className="font-semibold text-gray-900">{p.courseTitle || 'คอร์สเรียน'}</span>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {p.studentName} • {methodLabel(p.method)}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {p.paidAt ? formatDate(p.paidAt.toDate?.() || p.paidAt, 'd MMM yyyy') : formatDate(p.createdAt.toDate?.() || p.createdAt, 'd MMM yyyy')}
                    </span>
                    {p.transactionId && (
                      <span className="font-mono">#{p.transactionId}</span>
                    )}
                  </p>
                </div>
                <div className="w-full text-left sm:w-auto sm:text-right">
                  <p className="font-bold text-pink-700">{formatCurrency(p.amount)}</p>
                  {p.status === 'pending' && (
                    <Link href={`/bookings/${p.bookingId}/payment`} className="mt-2 inline-block">
                      <Button size="sm" className="w-full sm:w-auto">ชำระเงิน</Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* ใบเสร็จ */}
              {(p.status === 'paid' || p.status === 'refunded') && (
                <div className="mt-3 border-t border-pink-100 pt-3">
                  <Link href={`/payments/${p.id}/receipt`}>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">ดู / พิมพ์ใบเสร็จ PDF</Button>
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
