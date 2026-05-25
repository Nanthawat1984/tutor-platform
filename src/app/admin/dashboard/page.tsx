import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Users, Clock, BookOpen, Star } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { VerificationBadge } from '@/components/ui/badge';

export default async function AdminDashboard() {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const [teachersSnap, bookingsSnap, paymentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('role', '==', 'teacher').get(),
    db.collection(COLLECTIONS.BOOKINGS).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').get(),
  ]);
  const teachers = teachersSnap.docs.map((doc: any) => ({ uid: doc.id, ...doc.data() }));
  const pendingTeachers = teachers.filter((t: any) => !t.isVerified);
  const totalRevenue = paymentsSnap.docs.reduce((sum: number, d: any) => sum + ((d.data() as any).amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">ภาพรวมระบบ</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-blue-100 p-3"><Users className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-sm text-gray-500">ครูทั้งหมด</p><p className="text-xl font-bold">{teachers.length}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-yellow-100 p-3"><Clock className="h-5 w-5 text-yellow-600" /></div>
          <div><p className="text-sm text-gray-500">รออนุมัติ</p><p className="text-xl font-bold text-yellow-600">{pendingTeachers.length}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-green-100 p-3"><BookOpen className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-sm text-gray-500">การจองทั้งหมด</p><p className="text-xl font-bold">{bookingsSnap.size}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-purple-100 p-3"><Star className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-sm text-gray-500">รายได้รวม</p><p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p></div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">ครูที่รอการอนุมัติ</h2>
          <Link href="/admin/teachers"><Button variant="outline" size="sm">ดูทั้งหมด</Button></Link>
        </div>
        {pendingTeachers.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่มีครูที่รอการอนุมัติ</p>
        ) : (
          <div className="space-y-2">
            {pendingTeachers.slice(0, 5).map((t: any) => (
              <div key={t.uid} className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="font-medium">{t.displayName}</p><p className="text-sm text-gray-500">{t.email}</p></div>
                <VerificationBadge level={t.verificationLevel} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}


export const dynamic = 'force-dynamic';
