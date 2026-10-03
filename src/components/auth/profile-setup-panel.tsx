'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsentGate } from '@/components/legal/consent-gate';
import { RoleSelector, type SelectableRole } from '@/components/auth/role-selector';
import { useAuth } from '@/hooks/useFirebase';
import { PRIVACY_VERSION, TERMS_VERSION, type RegistrationConsent } from '@/lib/legal/consent';

function getSetupErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === 'not_signed_in') {
      return 'เซสชันหมดอายุแล้ว กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้ง';
    }
    if (error.message === 'consent_required') {
      return 'กรุณาเลื่อนอ่านข้อตกลงให้ถึงด้านล่างและกดยอมรับก่อนบันทึก';
    }
    if (error.message === 'profile-create-failed') {
      return 'สร้างโปรไฟล์ผู้ใช้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }
  }
  return 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

/**
 * ผู้ใช้ที่ยืนยันตัวตนผ่าน Firebase Auth สำเร็จ แต่ยังไม่มีเอกสารใน Firestore
 * (เช่น บัญชีที่สมัครก่อนย้ายฐานข้อมูล หรือ doc ถูกลบหาย) ต้องเลือกบทบาท
 * และยอมรับข้อตกลงก่อน จึงจะเข้าใช้งานระบบได้
 */
export function ProfileSetupPanel() {
  const { completeProfileSetup } = useAuth();
  const [role, setRole] = useState<SelectableRole>('parent');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const consent: RegistrationConsent | null = consentAccepted
    ? { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }
    : null;

  async function handleSubmit() {
    if (!consent) {
      setError('กรุณาอ่านและยอมรับข้อตกลงก่อนดำเนินการต่อ');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // เมื่อสำเร็จ userProfile จะถูกอัปเดต และ useEffect ของหน้า login
      // จะ redirect ไปหน้าหลักของบทบาทนั้นเอง
      await completeProfileSetup(role, consent);
    } catch (setupError) {
      setError(getSetupErrorMessage(setupError));
      setSubmitting(false);
    }
  }

  return (
    <div className="form-card space-y-5 p-7">
      <div>
        <h2 className="font-display text-lg font-extrabold text-slate-900">กรอกข้อมูลให้ครบก่อนใช้งาน</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          ยืนยันตัวตนสำเร็จแล้ว แต่บัญชีนี้ยังไม่มีข้อมูลผู้ใช้ในระบบ
          กรุณาเลือกบทบาทและยอมรับข้อตกลง แล้วระบบจะพาท่านไปยังหน้าหลักของบทบาทนั้น
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {error}
        </div>
      )}

      <RoleSelector value={role} onChange={setRole} disabled={submitting} />

      <ConsentGate
        accepted={consentAccepted}
        onAcceptedChange={setConsentAccepted}
        disabled={submitting}
      />

      <Button
        type="button"
        size="lg"
        className="w-full"
        isLoading={submitting}
        disabled={submitting || !consentAccepted}
        onClick={handleSubmit}
      >
        <Sparkles className="h-4 w-4" />
        บันทึกและเริ่มใช้งาน
      </Button>
    </div>
  );
}