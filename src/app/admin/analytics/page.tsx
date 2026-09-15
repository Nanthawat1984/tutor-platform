import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { requireAdmin } from '@/lib/auth/guards';
import CsvExportButton from '@/components/admin/csv-export-button';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toDate(value: any): Date | null {
  try {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// GET /admin/analytics — growth snapshot from real Firestore data (P3).
// Counts only, capped reads (500 bookings / 500 payments / 200 users per role),
// monthly buckets computed in memory. No new collections, no new indexes.
export default async function AdminAnalyticsPage() {
  const { db, session } = await requireAdmin();
  if (!db) return redirect('/login');

  const [bookingsSnap, paymentsSnap, teachersSnap, parentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.BOOKINGS).orderBy('createdAt', 'desc').limit(500).get(),
    db.collection(COLLECTIONS.PAYMENTS).where('status', '==', 'paid').orderBy('paidAt', 'desc').limit(500).get(),
    db.collection(COLLECTIONS.USERS).where('role', '==', 'teacher').limit(200).get(),
    db.collection(COLLECTIONS.USERS).where('role', '==', 'parent').limit(200).get(),
  ]);

  const bookings = bookingsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  const payments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  const confirmed = bookings.filter((b: any) => b.status === 'confirmed').length;
  const completed = bookings.filter((b: any) => b.status === 'completed').length;
  const cancelled = bookings.filter((b: any) => b.status === 'cancelled').length;
  const grossRevenue = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const platformFees = payments.reduce((s: number, p: any) => s + (Number(p.fees) || 0), 0);

  const monthly = new Map<string, { bookings: number; revenue: number }>();
  for (const b of bookings) {
    const d = toDate((b as any).createdAt);
    if (!d) continue;
    const key = monthKey(d);
    const row = monthly.get(key) || { bookings: 0, revenue: 0 };
    row.bookings += 1;
    monthly.set(key, row);
  }
  for (const p of payments) {
    const d = toDate((p as any).paidAt);
    if (!d) continue;
    const key = monthKey(d);
    const row = monthly.get(key) || { bookings: 0, revenue: 0 };
    row.revenue += Number((p as any).amount) || 0;
    monthly.set(key, row);
  }
  const months = [...monthly.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const maxBookings = Math.max(1, ...months.map(([, m]) => m.bookings));
  const maxRevenue = Math.max(1, ...months.map(([, m]) => m.revenue));

  return (
    <DashboardLayout
      title="ภาพรวมการเติบโต"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'Admin'}
    >
      <div className="mb-6">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับไปแดชบอร์ดแอดมิน
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'ครู (สูงสุด 200)', value: String(teachersSnap.size) },
          { label: 'ผู้ปกครอง (สูงสุด 200)', value: String(parentsSnap.size) },
          { label: 'จองสำเร็จ / เสร็จสิ้น', value: `${confirmed} / ${completed}` },
          { label: 'ยกเลิก', value: String(cancelled) },
          { label: 'รายได้รวม (500 รายการล่าสุด)', value: formatCurrency(grossRevenue) },
          { label: 'ค่าบริการแพลตฟอร์ม', value: formatCurrency(platformFees) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">รายเดือน (6 เดือนล่าสุด)</h2>
          <CsvExportButton
            filename="growth-monthly.csv"
            label="ดาวน์โหลด CSV"
            headers={['เดือน', 'การจอง', 'รายได้ (บาท)']}
            rows={months.map(([m, v]) => [m, v.bookings, v.revenue])}
          />
        </div>
        {months.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="space-y-3">
            {months.map(([m, v]) => (
              <li key={m}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">{m}</span>
                  <span className="text-slate-500">{v.bookings} จอง • {formatCurrency(v.revenue)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500"
                    style={{ width: `${Math.round((v.bookings / maxBookings) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    style={{ width: `${Math.round((v.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] text-slate-400">
          แถบชมพู = สัดส่วนการจอง, แถบเขียว = สัดส่วนรายได้ — นับจากข้อมูลจริงสูงสุด 500 รายการล่าสุด
        </p>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
