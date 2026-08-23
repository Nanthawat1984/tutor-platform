'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LockKeyhole } from 'lucide-react';
import { PrivacyConsentSummary, ServiceAgreementContent } from './service-agreement-content';

interface ConsentGateProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  disabled?: boolean;
}

export function ConsentGate({ accepted, onAcceptedChange, disabled = false }: ConsentGateProps) {
  const agreementRef = useRef<HTMLDivElement>(null);
  const [hasReadToEnd, setHasReadToEnd] = useState(false);

  function updateReadState() {
    const element = agreementRef.current;
    if (!element) return;
    setHasReadToEnd(element.scrollTop + element.clientHeight >= element.scrollHeight - 8);
  }

  useEffect(() => {
    updateReadState();
  }, []);

  return (
    <div className="rounded-2xl border-2 border-pink-100 bg-pink-50/30 p-4 sm:p-5">
      <div
        ref={agreementRef}
        onScroll={updateReadState}
        tabIndex={0}
        aria-label="ข้อตกลงผู้ใช้บริการและนโยบายความเป็นส่วนตัว"
        className="max-h-80 overflow-y-auto rounded-xl border border-pink-100 bg-white p-4 pr-3 shadow-inner sm:p-5"
      >
        <div className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-800">
          <LockKeyhole className="h-4 w-4 text-pink-600" />
          กรุณาอ่านข้อตกลงก่อนสมัครสมาชิก
        </div>
        <ServiceAgreementContent />
        <PrivacyConsentSummary />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {hasReadToEnd ? 'อ่านข้อตกลงครบแล้ว กรุณากดยอมรับเพื่อดำเนินการต่อ' : 'เลื่อนอ่านข้อตกลงจนถึงด้านล่างเพื่อเปิดใช้งานการยอมรับ'}
      </p>

      <label className={`mt-3 flex items-start gap-2 text-sm ${hasReadToEnd ? 'cursor-pointer text-slate-700' : 'cursor-not-allowed text-slate-400'}`}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          disabled={!hasReadToEnd || disabled}
          className="mt-0.5 h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500 disabled:cursor-not-allowed"
        />
        <span>
          ฉันได้อ่านและยอมรับ <Link href="/terms" target="_blank" className="font-bold text-pink-600 underline">ข้อตกลงผู้ใช้บริการ</Link> และรับทราบ <Link href="/privacy" target="_blank" className="font-bold text-pink-600 underline">นโยบายความเป็นส่วนตัว</Link>
        </span>
        {accepted && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
      </label>
    </div>
  );
}
