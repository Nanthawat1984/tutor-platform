'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Info,
  Landmark,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { PAYMENT_METHODS, type PaymentMethodInfo } from '@/lib/payments/config';

interface PaymentFlowProps {
  bookingId: string;
  amount: number;
  studentName: string;
  courseTitle: string;
}

interface InitiateResult {
  ok: boolean;
  paymentId: string;
  mode: 'mock' | 'stripe';
  method: string;
  checkoutUrl?: string | null;
  qrDataUrl?: string | null;
  bankDetails?: { bankName: string; accountName: string; accountNumber: string; ref: string } | null;
  promptpay?: { number: string; owner: string };
  expiresAt?: string;
  error?: string;
  message?: string;
}

export function PaymentFlow({ bookingId, amount, studentName, courseTitle }: PaymentFlowProps) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethodInfo | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState<InitiateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slipURL, setSlipURL] = useState<string | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);

  async function selectMethod(selectedMethod: PaymentMethodInfo) {
    setMethod(selectedMethod);
    setError(null);
    setData(null);
    setSlipURL(null);
    setInitiating(true);
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, method: selectedMethod.id }),
      });
      const json = await res.json() as InitiateResult;
      if (!res.ok) {
        setError(json.error === 'booking_not_payable' ? 'การจองนี้ชำระเงินแล้ว' : json.message || json.error || 'เกิดข้อผิดพลาด');
        return;
      }
      if (json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setData(json);
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่');
    } finally {
      setInitiating(false);
    }
  }

  async function uploadSlip(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพสำหรับสลิป');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ไฟล์ต้องไม่เกิน 5 MB');
      return;
    }
    setUploadingSlip(true);
    try {
      const formData = new FormData();
      formData.append('bookingId', bookingId);
      formData.append('file', file);
      const res = await fetch('/api/payments/upload-slip', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || 'อัปโหลดสลิปไม่สำเร็จ');
        return;
      }
      setSlipURL(json.url);
    } catch {
      setError('อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setUploadingSlip(false);
    }
  }

  async function confirmPayment() {
    if (!data?.paymentId) return;
    setError(null);
    setProcessing(true);
    try {
      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: data.paymentId,
          slipURL: method?.id === 'bank_transfer' ? slipURL : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || 'การชำระเงินไม่สำเร็จ');
        return;
      }
      router.push(`/bookings/${bookingId}/payment/success?paymentId=${data.paymentId}`);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setProcessing(false);
    }
  }

  const isMock = data?.mode === 'mock';
  const isStripeCheckout = method?.id === 'stripe_checkout';

  return (
    <div className="space-y-6">
      {!method ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">เลือกวิธีชำระเงิน</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAYMENT_METHODS.map((paymentMethod) => (
              <button
                key={paymentMethod.id}
                type="button"
                onClick={() => selectMethod(paymentMethod)}
                disabled={initiating}
                className={cn(
                  'group flex items-start gap-3 rounded-2xl border-2 border-pink-100 bg-white/85 p-4 text-left shadow-card transition-all',
                  'hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-elevated',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600 transition-colors group-hover:bg-pink-100">
                  {paymentMethod.id === 'stripe_checkout' && <CreditCard className="h-5 w-5" />}
                  {paymentMethod.id === 'bank_transfer' && <Landmark className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{paymentMethod.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{paymentMethod.description}</p>
                  <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                    {paymentMethod.badge}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                {isStripeCheckout ? <CreditCard className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
              </div>
              <div>
                <p className="font-bold text-slate-900">{method.label}</p>
                <p className="text-xs text-slate-500">{method.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setMethod(null); setData(null); setError(null); }}
              className="text-xs font-bold text-pink-600 hover:underline"
            >
              เปลี่ยนวิธี
            </button>
          </div>

          {initiating ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
              <p className="mt-3 text-sm text-slate-500">กำลังสร้างรายการชำระเงิน...</p>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {isMock && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p><span className="font-bold">โหมดทดสอบ (Mock Gateway)</span> — ไม่มีการหักเงินจริง</p>
                </div>
              )}

              {isStripeCheckout && data.qrDataUrl && (
                <div className="flex flex-col items-center rounded-2xl border-2 border-pink-100 bg-white/85 p-6 shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.qrDataUrl} alt="Mock PromptPay QR" className="h-56 w-56 rounded-xl border border-slate-200" />
                  <p className="mt-4 text-sm font-bold text-slate-800">QR ทดสอบ {formatCurrency(amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">พร้อมเพย์: {data.promptpay?.number} • {data.promptpay?.owner}</p>
                </div>
              )}

              {method.id === 'bank_transfer' && data.bankDetails && (
                <div className="space-y-3">
                  <div className="rounded-2xl border-2 border-pink-100 bg-white/85 p-5 shadow-card">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">โอนเงินเข้าบัญชี</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">ธนาคาร</span><span className="font-bold text-slate-800">{data.bankDetails.bankName}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">ชื่อบัญชี</span><span className="font-bold text-slate-800">{data.bankDetails.accountName}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">เลขบัญชี</span><span className="font-mono font-bold text-slate-800">{data.bankDetails.accountNumber}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">ยอดโอน</span><span className="font-bold text-pink-700">{formatCurrency(amount)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">รหัสอ้างอิง</span><span className="font-mono text-xs font-bold text-slate-600">{data.bankDetails.ref}</span></div>
                    </div>
                  </div>
                  <div className="rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 p-5 text-center">
                    <input type="file" accept="image/*" id="slip-upload" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadSlip(file); }} />
                    {slipURL ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <p className="text-sm font-bold text-emerald-700">อัปโหลดสลิปแล้ว</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slipURL} alt="สลิปโอนเงิน" className="mt-1 max-h-40 rounded-xl border border-slate-200" />
                        <label htmlFor="slip-upload" className="cursor-pointer text-xs font-bold text-pink-600 hover:underline">เปลี่ยนสลิป</label>
                      </div>
                    ) : (
                      <label htmlFor="slip-upload" className="flex cursor-pointer flex-col items-center gap-2">
                        {uploadingSlip ? <Loader2 className="h-8 w-8 animate-spin text-pink-500" /> : <Upload className="h-8 w-8 text-pink-400" />}
                        <p className="text-sm font-bold text-slate-700">{uploadingSlip ? 'กำลังอัปโหลด...' : 'อัปโหลดสลิปโอนเงิน'}</p>
                        <p className="text-xs text-slate-500">JPG, PNG — ไม่เกิน 5 MB</p>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p>
                </div>
              )}

              <Button
                onClick={confirmPayment}
                isLoading={processing}
                disabled={method.id === 'bank_transfer' && !slipURL}
                size="lg"
                className="w-full"
              >
                {processing ? 'กำลังประมวลผล...' : `ยืนยันการชำระเงิน ${formatCurrency(amount)}`}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> กดยืนยัน = ตกลงชำระเงินสำหรับ {courseTitle} ({studentName})
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
