import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FieldValue } from 'firebase-admin/firestore';
import { ShieldCheck, Info } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import KycFileUploader from '@/components/teacher/kyc-file-uploader';

const BANKS = [
  'ธนาคารกสิกรไทย (KBank)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยเลือกเจริญทรัพย์ (TTB)',
  'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
  'ธนาคารซีไอเอ็มบีไทย (CIMB)',
  'ธนาคารยูโอบี (UOB)',
  'ธนาคารอาคารสงเคราะห์ (GHB)',
  'อื่นๆ',
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  none: { label: 'ยังไม่ส่งข้อมูล', cls: 'bg-slate-100 text-slate-600' },
  pending: { label: 'รอตรวจสอบ', cls: 'bg-amber-100 text-amber-700' },
  verified: { label: 'ยืนยันตัวตนสำเร็จ', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'ไม่ผ่าน — โปรดแก้ไข', cls: 'bg-red-100 text-red-700' },
};

export default async function PayoutSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const params = await searchParams;

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  const user = userSnap.exists ? userSnap.data() as any : {};
  const kycStatus: string = user.kycStatus || 'none';
  const badge = STATUS_BADGE[kycStatus] || STATUS_BADGE.none;

  async function savePayoutAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;

    const accountNumber = (formData.get('payout_account_number') as string || '').replace(/\D/g, '');
    const bookBankURL = formData.get('bookBankURL') as string;
    const idCardURL = formData.get('idCardURL') as string;
    if (!accountNumber || !bookBankURL || !idCardURL) {
      redirect('/profile/payout?error=incomplete');
      return;
    }

    await dbRef.collection(COLLECTIONS.USERS).doc(teacherId).update({
      payoutBankName: formData.get('payout_bank_name') as string,
      payoutAccountName: (formData.get('payout_account_name') as string || '').trim(),
      payoutAccountNumber: accountNumber,
      bookBankURL,
      idCardURL,
      kycStatus: 'pending',
      kycSubmittedAt: FieldValue.serverTimestamp(),
      kycNote: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/profile/payout?saved=1');
  }

  return (
    <DashboardLayout
      title="บัญชีรับเงิน & ยืนยันตัวตน (KYC)"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          ข้อมูลนี้ใช้สำหรับโอนค่าตอบแทนการสอนและออกเอกสารภาษี — ไม่แสดงบนโปรไฟล์สาธารณะ
        </p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
      </div>

      {params.saved && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">
          ✅ บันทึกข้อมูลแล้ว — ทีมงานจะตรวจสอบเอกสารและยืนยันตัวตนให้ภายใน 1–3 วันทำการ
        </div>
      )}
      {user.kycNote && kycStatus === 'rejected' && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          ❌ เหตุผลที่ไม่ผ่าน: {user.kycNote}
        </div>
      )}

      {kycStatus === 'verified' && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <ShieldCheck className="h-8 w-8 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-800">
            ยืนยันตัวตนสำเร็จ — คุณสามารถกด "ขอเบิกเงิน" ที่หน้า{' '}
            <Link href="/earnings" className="font-semibold underline">รายได้</Link>{' '}
            ได้แล้ว (หากแก้ไขข้อมูลบัญชี ระบบจะพากลับเข้าสู่การตรวจสอบใหม่)
          </p>
        </div>
      )}

      <form action={savePayoutAction} className="space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">บัญชีธนาคารสำหรับรับเงิน</h2>
          <Select
            label="ธนาคาร"
            name="payout_bank_name"
            options={[{ value: '', label: '-- เลือกธนาคาร --' }, ...BANKS.map((b) => ({ value: b, label: b }))]}
            defaultValue={user.payoutBankName || ''}
            required
          />
          <Input
            label="ชื่อบัญชี (ต้องตรงกับชื่อบนบัตรประชาชน)"
            name="payout_account_name"
            defaultValue={user.payoutAccountName || ''}
            required
          />
          <Input
            label="เลขที่บัญชี"
            name="payout_account_number"
            defaultValue={user.payoutAccountNumber || ''}
            placeholder="XXX-X-XXXXX-X"
            inputMode="numeric"
            required
          />
        </div>

        <div className="form-card p-6 sm:p-8 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            เอกสารยืนยันตัวตน (KYC)
          </h2>
          <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            ข้อมูลถูกเก็บเป็นความลับ ใช้เพื่อยืนยันตัวตนและออกเอกสารภาษีเท่านั้น
          </div>
          <KycFileUploader
            uid={teacherId}
            fieldName="bookBankURL"
            label="สำเนาสมุดบัญชีธนาคาร (หน้าแรกที่มีชื่อ + เลขบัญชี)"
            hint="ถ่ายรูปหรือสแกนหน้าสมุดบัญชีให้ชัดเจน"
            initialUrl={user.bookBankURL}
          />
          <KycFileUploader
            uid={teacherId}
            fieldName="idCardURL"
            label="สำเนาบัตรประชาชนผู้เป็นเจ้าของบัญชี"
            hint="ถ่ายด้านหน้า+ด้านหลัง ชัดเจน ไม่มีการแก้ไข"
            initialUrl={user.idCardURL}
          />
        </div>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">
            {kycStatus === 'verified' ? 'บันทึกการแก้ไข (ต้องตรวจสอบใหม่)' : 'ส่งข้อมูลเพื่อยืนยันตัวตน'}
          </Button>
          <Link href="/earnings" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
