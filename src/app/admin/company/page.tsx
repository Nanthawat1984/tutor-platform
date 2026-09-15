import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { DashboardLayout } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { requireAdmin } from '@/lib/auth/guards';
import { logEvent } from '@/lib/log';

// Admin company settings — fills COMPANY_* fields used by 50 ทวิ / ภ.ง.ด.53.
// Stored in settings/company (single doc), read by tax pages with env fallback.
export default async function AdminCompanyPage() {
  const { db, session } = await requireAdmin();
  if (!db) return redirect('/login');

  const snap = await db.collection('settings').doc('company').get();
  const s = snap.exists ? (snap.data() as any) : {};

  async function saveCompany(formData: FormData) {
    'use server';
    const { db: dbRef, session: admin } = await requireAdmin();
    const name = String(formData.get('name') || '').trim().slice(0, 120);
    const taxId = String(formData.get('taxId') || '').replace(/\D/g, '').slice(0, 13);
    const address = String(formData.get('address') || '').trim().slice(0, 300);
    const branch = String(formData.get('branch') || '').trim().slice(0, 60) || 'สำนักงานใหญ่';
    if (!name) return;
    if (taxId && taxId.length !== 13) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    await dbRef!.collection('settings').doc('company').set({
      name, taxId: taxId || null, address: address || null, branch,
      updatedBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    logEvent('info', 'company_settings_updated', {});
    redirect('/admin/company?saved=1');
  }

  return (
    <DashboardLayout
      title="ข้อมูลบริษัท (สำหรับเอกสารภาษี)"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'Admin'}
    >
      <div className="mb-6">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับไปแดชบอร์ดแอดมิน
        </Link>
      </div>
      <form action={saveCompany} className="max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">ชื่อบริษัท/ผู้หักภาษี</label>
          <input name="name" defaultValue={s.name || ''} required className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
          <input name="taxId" defaultValue={s.taxId || ''} inputMode="numeric" maxLength={13} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">ที่อยู่</label>
          <textarea name="address" defaultValue={s.address || ''} rows={3} className="min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">สาขา</label>
          <input name="branch" defaultValue={s.branch || 'สำนักงานใหญ่'} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700">
          บันทึก
        </button>
        <p className="text-[11px] text-slate-400">ใช้พิมพ์บน 50 ทวิ และ ภ.ง.ด.53 — ถ้าไม่กรอกจะใช้ค่าจาก environment แทน</p>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
