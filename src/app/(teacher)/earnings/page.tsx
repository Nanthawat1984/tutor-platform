import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export default async function EarningsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const teacherId = 'temp-teacher-id';
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('status', '==', 'paid')
    .get();

  const payments = paymentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  const totalEarnings = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">รายได้</h1>
        <p className="text-sm text-gray-500">สรุปรายได้ของคุณ</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-gray-500">รายได้รวม</p><p className="text-xl font-bold">{formatCurrency(totalEarnings)}</p></Card>
        <Card><p className="text-sm text-gray-500">ค่าบริการ 20%</p><p className="text-xl font-bold">{formatCurrency(totalEarnings * 0.2)}</p></Card>
        <Card><p className="text-sm text-gray-500">รายได้สุทธิ</p><p className="text-xl font-bold text-green-600">{formatCurrency(totalEarnings * 0.8)}</p></Card>
      </div>
    </div>
  );
}


export const dynamic = 'force-dynamic';
