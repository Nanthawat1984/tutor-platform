'use client';

// RescheduleForm — ฟอร์มเลื่อนคาบเรียน (self-service) ใช้ร่วมกันทั้ง parent และ teacher
// ส่ง slot ไปที่ POST /api/bookings/[id]/reschedule แล้วให้ API ตรวจกติกา + ชนครูอีกชั้น
// สล็อตทั้งหมดถูกกรองด้วย buildAvailableBookingSlots ฝั่ง server เหมือนหน้าจองใหม่

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';

export interface RescheduleSlot {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface RescheduleFormProps {
  bookingId: string;
  slots: RescheduleSlot[];
  /** จำนวนครั้งที่เลื่อนไปแล้ว — ครบ 2 ครั้ง (ฟรี) จะเตือนในฟอร์ม */
  rescheduleCount: number;
  /** slot ปัจจุบันของการจอง เพื่อซ่อนออกจากรายการ */
  currentSlot: { date: string; startTime: string; endTime: string };
}

export default function RescheduleForm({
  bookingId,
  slots,
  rescheduleCount,
  currentSlot,
}: RescheduleFormProps) {
  const router = useRouter();
  const [slotValue, setSlotValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [
    { value: '', label: '-- เลือกวันและเวลาใหม่ที่ครูเปิดไว้ --' },
    ...slots
      .filter((s) => !(s.date === currentSlot.date && s.startTime === currentSlot.startTime))
      .map((s) => ({
        value: JSON.stringify(s),
        label: formatSlotLabel(s.date, s.startTime, s.endTime),
      })),
  ];

  const atFreeLimit = rescheduleCount >= 2;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slotValue || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: JSON.parse(slotValue) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(ERROR_TH[data.error || ''] || 'เลื่อนเวลาไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-pink-600" />
        <h3 className="font-bold text-slate-900">เลื่อนคาบเรียน</h3>
      </div>
      <p className="text-xs text-slate-500">
        เลื่อนฟรีได้ 2 ครั้งต่อการจอง เมื่อแจ้งล่วงหน้า ≥ 24 ชม. — เลื่อนสาย (น้อยกว่า 24 ชม.) ทำได้
        แต่ครูจะเห็นธงแจ้งเตือนและสามารถเปิดข้อพิพาทได้
      </p>
      {atFreeLimit && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          คุณเลื่อนครบ 2 ครั้งแล้ว — การเลื่อนครั้งต่อไปจะติดธงแจ้งเตือนครูทันที
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Select
          label="ช่วงเวลาใหม่"
          name="reschedule_slot"
          options={options}
          value={slotValue}
          onChange={(e) => setSlotValue(e.target.value)}
          required
          disabled={options.length <= 1 || submitting}
          helperText={options.length <= 1 ? 'ขณะนี้ไม่มีช่วงเวลาว่างใน 60 วันข้างหน้า' : undefined}
        />
        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            ⚠ {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!slotValue || submitting || options.length <= 1}>
            {submitting ? 'กำลังเลื่อน...' : 'ยืนยันการเลื่อน'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const ERROR_TH: Record<string, string> = {
  past_session: 'เซสชันนี้เริ่มไปแล้ว ไม่สามารถเลื่อนได้',
  too_many_reschedules: 'เลื่อนครบจำนวนครั้งที่กำหนดแล้ว กรุณาติดต่อครูโดยตรง',
  invalid_status: 'การจองนี้เลื่อนไม่ได้ (ถูกยกเลิกหรือจบแล้ว)',
  invalid_slot: 'วันเวลาที่เลือกไม่ถูกต้อง',
  booking_conflict: 'ช่วงเวลานี้ครูไม่ว่างแล้ว กรุณาเลือกเวลาอื่น',
  slot_unavailable: 'ช่วงเวลาที่เลือกไม่ตรงกับตารางครู',
  forbidden: 'คุณไม่มีสิทธิ์เลื่อนการจองนี้',
};

function formatSlotLabel(date: string, startTime: string, endTime: string): string {
  const formattedDate = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00+07:00`));
  return `${formattedDate} เวลา ${startTime} - ${endTime} น.`;
}
