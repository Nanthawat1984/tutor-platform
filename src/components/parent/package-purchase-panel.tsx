'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, QrCode, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

interface PurchasePanelProps {
  packageId: string;
  packageTitle: string;
  courseTitle: string;
  priceTotal: number;
  sessionsTotal: number;
  students: { id: string; name: string }[];
  paymentId?: string;
  cancelled?: boolean;
}

interface PurchaseResult {
  ok: boolean;
  purchaseId?: string;
  paymentId?: string;
  amount?: number;
  checkoutUrl?: string | null;
  qrDataUrl?: string | null;
  bankDetails?: { bankName: string; accountName: string; accountNumber: string; ref: string } | null;
  paidByCredit?: boolean;
  error?: string;
}

const METHOD_OPTIONS = [
  { value: 'stripe_checkout', label: 'บัตรเครดิต / PromptPay (Stripe)' },
  { value: 'bank_transfer', label: 'โอนเงิน / แจ้งสลิป' },
];

const ERROR_LABELS: Record<string, string> = {
  invalid_input: 'ข้อมูลไม่ครบถ้วน',
  package_not_found: 'ไม่พบแพ็กเกจนี้',
  package_inactive: 'แพ็กเกจนี้ปิดขายแล้ว',
  forbidden: 'ไม่มีสิทธิ์ใช้งาน',
  already_owned: 'คุณมีแพ็กเกจนี้ที่ยังใช้ได้อยู่แล้ว',
  coupon_invalid: 'คูปองไม่ถูกต้องหรือหมดอายุ',
  gateway_error: 'ช่องทางชำระเงินขัดข้อง ลองใหม่อีกครั้ง',
};

function uploadSlip(purchaseId: string, file: File): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    xhr.open('POST', `/api/packages/${purchaseId}/upload-slip`);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        resolve({ ok: xhr.status >= 200 && xhr.status < 300 && data.ok !== false, error: data.error });
      } catch {
        resolve({ ok: false, error: 'upload_failed' });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: 'network' });
    xhr.send(form);
  });
}

export function PurchasePanel({
  packageId,
  packageTitle,
  courseTitle,
  priceTotal,
  sessionsTotal,
  students,
  paymentId: initialPaymentId,
  cancelled,
}: PurchasePanelProps) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [method, setMethod] = useState('stripe_checkout');
  const [couponCode, setCouponCode] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipDone, setSlipDone] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // เคสกลับมาจาก Stripe แบบ cancelled=1
  useEffect(() => {
    if (cancelled) setError('คุณยกเลิกการชำระเงิน — กดซื้ออีกครั้งเพื่อเริ่มใหม่');
  }, [cancelled]);

  async function handleSubmit() {
    if (submitting) return;
    if (!studentId) { setError('กรุณาเลือกนักเรียน'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/packages/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          studentId,
          method,
          couponCode: couponCode || undefined,
          useWallet,
        }),
      });
      const data: PurchaseResult = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        setError(ERROR_LABELS[data.error || ''] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
        return;
      }
      if (data.paidByCredit) {
        // จ่ายครบด้วย wallet+คูปอง → เปิดใช้ทันที
        router.push(`/packages/${data.purchaseId}`);
        return;
      }
      setResult(data);
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
    } catch {
      setError('เครือข่ายขัดข้อง ลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSlipUpload() {
    if (!result?.purchaseId || !slipFile || slipUploading) return;
    setSlipUploading(true);
    try {
      const res = await uploadSlip(result.purchaseId, slipFile);
      if (res.ok) {
        setSlipDone(true);
        router.push('/packages');
      }
    } finally {
      setSlipUploading(false);
    }
  }

  // ── สถานะหลังสร้างรายการ: QR หรือเลขบัญชี ──
  if (result) {
    return (
      <div className="rounded-2xl border border-pink-100 bg-white p-6 shadow-card">
        <h3 className="text-lg font-bold text-slate-900">ชำระเงิน {formatCurrency(result.amount || priceTotal)}</h3>
        <p className="mt-1 text-sm text-slate-500">แพ็กเกจ {packageTitle} • {sessionsTotal} ครั้ง</p>

        {result.qrDataUrl && (
          <div className="mt-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.qrDataUrl} alt="QR พร้อมเพย์" className="mx-auto w-52 rounded-xl border border-slate-100" />
            <p className="mt-2 text-xs text-slate-400">สแกนเพื่อชำระ (โหมดทดสอบ)</p>
          </div>
        )}

        {result.bankDetails && (
          <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-bold text-slate-900"><Landmark className="h-4 w-4 text-pink-600" /> {result.bankDetails.bankName}</p>
            <p className="text-slate-600">ชื่อบัญชี: {result.bankDetails.accountName}</p>
            <p className="text-slate-600">เลขบัญชี: <span className="font-mono font-bold">{result.bankDetails.accountNumber}</span></p>
            <p className="text-slate-600">รหัสอ้างอิง: <span className="font-mono font-bold text-pink-700">{result.bankDetails.ref}</span></p>
          </div>
        )}

        {result.bankDetails && (
          <div className="mt-4">
            <input
              ref={slipInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
            />
            {!slipDone ? (
              <>
                <Button variant="outline" onClick={() => slipInputRef.current?.click()} className="w-full">
                  {slipFile ? `เลือกแล้ว: ${slipFile.name}` : 'แนบสลิปการโอนเงิน'}
                </Button>
                <Button
                  className="mt-2 w-full"
                  onClick={handleSlipUpload}
                  disabled={!slipFile}
                  isLoading={slipUploading}
                >
                  ส่งสลิปเพื่อยืนยัน
                </Button>
                <p className="mt-2 text-center text-xs text-slate-400">
                  แอดมินจะตรวจสอบสลิปและยืนยัน แพ็กเกจจะเปิดใช้หลังอนุมัติ
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">
                ส่งสลิปแล้ว รอแอดมินตรวจสอบ — ดูสถานะที่หน้า แพ็กเกจของฉัน
              </p>
            )}
          </div>
        )}

        {result.qrDataUrl && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-xs font-semibold text-amber-700">
            โหมดทดสอบ (Mock Gateway) — ไม่มีการหักเงินจริง
          </p>
        )}

        <button
          type="button"
          onClick={() => { setResult(null); setSlipFile(null); setSlipDone(false); }}
          className="mt-4 w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600"
        >
          เปลี่ยนช่องทางชำระเงิน
        </button>
      </div>
    );
  }

  // ── ฟอร์มหลัก ──
  return (
    <div className="rounded-2xl border border-pink-100 bg-white p-6 shadow-card">
      <h3 className="text-lg font-bold text-slate-900">สรุปคำสั่งซื้อ</h3>

      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">จำนวนเรียน</span><span className="font-bold text-slate-900">{sessionsTotal} ครั้ง</span></div>
        <div className="flex justify-between"><span className="text-slate-500">ราคารวม</span><span className="font-extrabold text-pink-700">{formatCurrency(priceTotal)}</span></div>
      </div>

      {students.length === 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          กรุณาเพิ่มนักเรียนก่อนซื้อแพ็กเกจ
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <Select
            label="นักเรียน"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label="ช่องทางชำระเงิน"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={METHOD_OPTIONS}
          />
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">คูปอง (ถ้ามี)</span>
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="เช่น WELCOME10"
              maxLength={32}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={useWallet}
              onChange={(e) => setUseWallet(e.target.checked)}
              className="h-4 w-4 accent-pink-600"
            />
            <Wallet className="h-4 w-4 text-pink-600" /> ใช้เครดิต wallet ร่วมจ่าย
          </label>
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      <Button
        className="mt-4 w-full"
        onClick={handleSubmit}
        disabled={students.length === 0 || !studentId}
        isLoading={submitting}
      >
        <QrCode className="mr-1.5 h-4 w-4" />
        ดำเนินการชำระเงิน
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">
        ซื้อแล้วใช้เครดิตจองเรียนได้ทันที โดยไม่ต้องชำระต่อครั้ง
      </p>
    </div>
  );
}
