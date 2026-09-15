import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';

// GET /my-profile/data — PDPA self-service page: download my data (JSON)
// or request deletion. Deletion is a request reviewed by admin (not instant)
// to protect escrow/payment integrity.
export default async function MyDataPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  await requireRole(['parent']);

  async function requestDeletion() {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['parent'])).session;
    const { FieldValue } = await import('firebase-admin/firestore');
    await dbRef.collection('deletionRequests').add({
      uid: current.uid,
      email: current.email,
      status: 'requested',
      createdAt: FieldValue.serverTimestamp(),
    });
    try {
      const { logEvent } = await import('@/lib/log');
      logEvent('info', 'pdpa_deletion_requested', {});
    } catch { /* ignore */ }
    redirect('/my-profile/data?requested=1');
  }

  return (
    <DashboardLayout
      title="ข้อมูลของฉัน (PDPA)"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <div className="max-w-xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">ขอสำเนาข้อมูล</h2>
          <p className="mt-1 text-sm text-slate-500">ดาวน์โหลดโปรไฟล์ นักเรียน การจอง รีวิว และการแจ้งเตือนของคุณเป็น JSON</p>
          <a
            href="/api/me/export"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
          >
            ดาวน์โหลดข้อมูลของฉัน
          </a>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h2 className="font-bold text-slate-900">ขอลบข้อมูล</h2>
          <p className="mt-1 text-sm text-slate-600">
            การลบเป็นคำขอให้แอดมินตรวจสอบก่อน (ไม่ลบอัตโนมัติ) เพื่อป้องกันยอดเงินค้างใน escrow
            แอดมินจะติดต่อกลับภายใน 30 วัน
          </p>
          <form action={requestDeletion}>
            <button type="submit" className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border-2 border-rose-300 bg-white px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50">
              ส่งคำขอลบข้อมูล
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
