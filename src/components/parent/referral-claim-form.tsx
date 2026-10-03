'use client';

// ReferralClaimForm — กรอกโค้ดของเพื่อนที่แนะนำมา
// ยิงไปที่ POST /api/referrals (server validate รูปแบบโค้ด/กันใช้ซ้ำ/กันชวนตัวเอง)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ERROR_TH: Record<string, string> = {
  invalid_code: 'โค้ดไม่ถูกต้อง — ต้องขึ้นต้นด้วย TF-',
  self_referral: 'ใช้โค้ดของตัวเองไม่ได้',
  already_claimed: 'คุณเคยใช้โค้ดแนะนำไปแล้ว (ใช้ได้ครั้งเดียว)',
  rate_limited: 'กดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
  unauthorized: 'กรุณาเข้าสู่ระบบก่อน',
  server_not_configured: 'ระบบยังไม่พร้อมให้บริการ ลองใหม่ภายหลัง',
};

export default function ReferralClaimForm({ className }: { className?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(ERROR_TH[data.error || ''] || 'ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setDone(true);
      setCode('');
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={`rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className || ''}`}>
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <Check className="h-4 w-4" />
          ใช้โค้ดเรียบร้อยแล้ว
        </p>
        <p className="mt-1 text-xs text-emerald-700">
          เพื่อนของคุณจะได้รับรางวัลเมื่อคุณชำระเงินสำเร็จครั้งแรก
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-3 ${className || ''}`}>
      <Input
        label="มีโค้ดจากเพื่อนไหม?"
        name="referral_code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="TF-XXXXXX"
        maxLength={16}
        autoComplete="off"
        autoCapitalize="characters"
        disabled={submitting}
        leftIcon={<Gift className="h-4 w-4" />}
        helperText="ใช้ได้ครั้งเดียวต่อบัญชี"
      />
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          ⚠ {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={submitting || code.trim().length < 4}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
        {submitting ? 'กำลังใช้โค้ด...' : 'ใช้โค้ดนี้'}
      </Button>
    </form>
  );
}