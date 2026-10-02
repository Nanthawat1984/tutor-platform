'use client';

// CancelBookingButton — ยกเลิกการจองด้วยตัวเอง (ใช้ได้ทั้งฝั่งครูและผู้ปกครอง)
// ส่งไปที่ POST /api/bookings/[id]/cancel — เงินคืนเข้าวอลเล็ตผู้ปกครองตามกติกา
// ใน @/lib/booking-policy (ยกเลิกล่วงหน้า ≥ 24 ชม. คืนเต็ม, สายคืนครึ่ง)

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

const ERROR_TH: Record<string, string> = {
  forbidden: 'คุณไม่มีสิทธิ์ยกเลิกการจองนี้',
  not_found: 'ไม่พบการจองนี้',
  past_session: 'เซสชันนี้เริ่มไปแล้ว ไม่สามารถยกเลิกได้',
  invalid_status: 'การจองนี้ยกเลิกไม่ได้ (ถูกยกเลิกหรือจบแล้ว)',
  refund_failed: 'คืนเงินไม่สำเร็จ — กรุณาติดต่อผู้ดูแลระบบ',
};

interface CancelBookingButtonProps {
  bookingId: string;
  label?: string;
  variant?: 'outline' | 'ghost' | 'danger';
  className?: string;
}

export default function CancelBookingButton({
  bookingId,
  label = 'ยกเลิกคลาสนี้',
  variant = 'outline',
  className,
}: CancelBookingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ refunded: number } | null>(null);

  async function handleCancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; refunded?: number };
      if (!res.ok) {
        setError(ERROR_TH[data.error || ''] || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setResult({ refunded: Number(data.refunded) || 0 });
      setOpen(false);
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        ยกเลิกคลาสแล้ว
        {result.refunded > 0
          ? ` — คืนเครดิตวอลเล็ตให้ผู้ปกครอง ${formatCurrency(result.refunded)} (ดูที่หน้าการชำระเงิน)`
          : ' — ไม่มีเงินคืน'}
      </p>
    );
  }

  return (
    <div className={className}>
      {!open ? (
        <Button type="button" variant={variant} onClick={() => setOpen(true)}>
          <Ban className="h-4 w-4" />
          {label}
        </Button>
      ) : (
        <form
          onSubmit={handleCancel}
          className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3"
        >
          <p className="text-xs font-semibold text-rose-700">
            ยกเลิกแล้วกู้คืนไม่ได้ — เงินจะคืนเป็นเครดิตวอลเล็ตให้ผู้ปกครอง
            (ยกเลิกล่วงหน้า ≥ 24 ชม. คืนเต็ม, สายคืน 50%)
          </p>
          <Textarea
            label="เหตุผล (ถ้ามี)"
            name="cancel_reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="เช่น นัดเรียนไม่ได้วันนี้..."
            disabled={submitting}
          />
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              ⚠ {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
              กลับ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}