'use client';

// DisputeForm — เปิดข้อพิพาทของการจอง (parent/teacher คู่สัญญา)
// ส่งไปที่ PUT /api/bookings/[id]/dispute — แอดมินเป็นผู้ตัดสินภายหลัง

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';

const REASONS = [
  { value: '', label: '-- เลือกสาเหตุ --' },
  { value: 'ครูไม่มาสอนตามนัด', label: 'ครูไม่มาสอนตามนัด' },
  { value: 'ยกเลิก/เลื่อนบ่อยเกินไป', label: 'ยกเลิก/เลื่อนบ่อยเกินไป' },
  { value: 'คุณภาพการสอนไม่ตรงตามที่แจ้ง', label: 'คุณภาพการสอนไม่ตรงตามที่แจ้ง' },
  { value: 'ปัญหาการชำระเงิน/คืนเงิน', label: 'ปัญหาการชำระเงิน/คืนเงิน' },
  { value: 'อื่น ๆ', label: 'อื่น ๆ (ระบุในรายละเอียด)' },
] as const;

const ERROR_TH: Record<string, string> = {
  reason_required: 'กรุณาระบุสาเหตุของข้อพิพาท',
  already_open: 'การจองนี้มีข้อพิพาทที่เปิดอยู่แล้ว',
  forbidden: 'คุณไม่มีสิทธิ์เปิดข้อพิพาทของการจองนี้',
  not_found: 'ไม่พบการจองนี้',
};

interface DisputeFormProps {
  bookingId: string;
}

export default function DisputeForm({ bookingId }: DisputeFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!reason.trim()) {
      setError('กรุณาระบุสาเหตุของข้อพิพาท');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/dispute`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(ERROR_TH[data.error || ''] || 'เปิดข้อพิพาทไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="space-y-2 border-emerald-200 bg-emerald-50/50">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-emerald-600" />
          <h3 className="font-bold text-slate-900">ส่งเรื่องข้อพิพาทแล้ว</h3>
        </div>
        <p className="text-sm text-slate-600">
          ทีมงานจะตรวจสอบและตัดสินใจแจ้งทั้งสองฝ่ายให้ทราบ — ขอบคุณที่แจ้งให้ทราบค่ะ
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 border-rose-100 bg-rose-50/40">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-rose-600" />
        <h3 className="font-bold text-slate-900">แจ้งข้อพิพาท</h3>
      </div>
      <p className="text-xs text-slate-500">
        ใช้เมื่อคุยกับอีกฝ่ายแล้วไม่ตกลงกันได้ เช่น ครูไม่มาสอน ยกเลิกบ่อย หรือปัญหาเรื่องเงิน —
        แอดมินจะเป็นผู้ตรวจสอบและตัดสิน ไม่ควรใช้แทนการคุยกันก่อน
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Select
          label="สาเหตุ"
          name="dispute_reason"
          options={[...REASONS]}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          disabled={submitting}
        />
        <Textarea
          label="รายละเอียดเพิ่มเติม (ถ้ามี)"
          name="dispute_note"
          placeholder="เล่าเหตุการณ์โดยย่อ เช่น วันเวลาที่เกิดปัญหา สิ่งที่คุยกันไว้..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
        />
        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            ⚠ {error}
          </p>
        )}
        <Button type="submit" size="sm" variant="danger" disabled={submitting}>
          {submitting ? 'กำลังส่ง...' : 'ส่งเรื่องให้แอดมินตรวจสอบ'}
        </Button>
      </form>
    </Card>
  );
}
