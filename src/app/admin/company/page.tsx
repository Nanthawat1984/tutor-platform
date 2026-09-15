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
    const addrNo = String(formData.get('addrNo') || '').trim().slice(0, 100);
    const subdistrict = String(formData.get('subdistrict') || '').trim().slice(0, 60);
    const district = String(formData.get('district') || '').trim().slice(0, 60);
    const province = String(formData.get('province') || '').trim().slice(0, 60);
    const postcode = String(formData.get('postcode') || '').replace(/\D/g, '').slice(0, 5);
    const addressLegacy = String(formData.get('address') || '').trim().slice(0, 300);
    const branch = String(formData.get('branch') || '').trim().slice(0, 60) || 'สำนักงานใหญ่';
    if (!name) return;
    if (taxId && taxId.length !== 13) return;
    if (postcode && postcode.length !== 5) return;
    const addressParts = [addrNo, subdistrict ? `แขวง/ตำบล${subdistrict}` : '', district ? `เขต/อำเภอ${district}` : '', province, postcode].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(' ') : addressLegacy;
    const { FieldValue } = await import('firebase-admin/firestore');
    await dbRef!.collection('settings').doc('company').set({
      name, taxId: taxId || null, address: address || null, branch,
      addrNo: addrNo || null, subdistrict: subdistrict || null, district: district || null,
      province: province || null, postcode: postcode || null,
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
          <label className="mb-1 block text-xs font-bold text-slate-600">ที่อยู่ (แบบเดิม — ถ้ากรอกแยกส่วนจะใช้ส่วนนั้นแทน)</label>
          <textarea name="address" defaultValue={s.address && !(s.addrNo || s.province) ? s.address : ''} rows={2} className="min-h-[60px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">บ้านเลขที่ หมู่ ซอย ถนน</label>
            <input name="addrNo" defaultValue={s.addrNo || ''} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">แขวง/ตำบล</label>
            <input name="subdistrict" defaultValue={s.subdistrict || ''} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">เขต/อำเภอ</label>
            <input name="district" defaultValue={s.district || ''} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">จังหวัด</label>
            <input name="province" defaultValue={s.province || ''} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">รหัสไปรษณีย์ (5 หลัก)</label>
            <input name="postcode" defaultValue={s.postcode || ''} inputMode="numeric" maxLength={5} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
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
