'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus, Loader2, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreditSlot {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface PackagePaymentPanelProps {
  purchaseId: string;
  purchaseStatus: string;
  courseId: string;
  courseDurationMinutes: number;
  sessionsRemaining: number;
}

const SLOT_OPTIONS = [30, 60, 90, 120];

function formatSlotDay(date: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00+07:00`));
}

export function PackagePaymentPanel({
  purchaseId,
  purchaseStatus,
  courseDurationMinutes,
  sessionsRemaining,
}: PackagePaymentPanelProps) {
  const router = useRouter();
  const [slots, setSlots] = useState<CreditSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<CreditSlot | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const canBook = purchaseStatus === 'active' && sessionsRemaining > 0;

  const loadSlots = useCallback(async () => {
    if (!canBook) return;
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const res = await fetch(`/api/packages/credits/slots?purchaseId=${encodeURIComponent(purchaseId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSlotsError(
          data.error === 'insufficient_credit' ? 'เครดิตไม่พอสำหรับจอง'
            : data.error === 'forbidden' ? 'ไม่มีสิทธิ์เข้าถึงแพ็กเกจนี้'
            : 'โหลดช่วงเวลาว่างไม่สำเร็จ ลองใหม่อีกครั้ง',
        );
        setSlots([]);
        return;
      }
      const list: CreditSlot[] = Array.isArray(data.slots) ? data.slots : [];
      setSlots(list);
      const dates = Array.from(new Set(list.map((s) => s.date))).sort();
      setSelectedDate((prev) => (prev && dates.includes(prev) ? prev : dates[0] || ''));
    } catch {
      setSlotsError('เครือข่ายขัดข้อง ลองใหม่อีกครั้ง');
    } finally {
      setSlotsLoading(false);
    }
  }, [canBook, purchaseId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const dates = useMemo(() => Array.from(new Set(slots.map((s) => s.date))).sort(), [slots]);
  const slotsForDate = useMemo(
    () => slots.filter((s) => s.date === selectedDate),
    [slots, selectedDate],
  );

  async function handleBook() {
    if (!selectedSlot || booking) return;
    setBooking(true);
    setBookError(null);
    try {
      const res = await fetch('/api/packages/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId, slot: selectedSlot }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push(`/bookings/${data.bookingId}?booked=1`);
        return;
      }
      setBookError(
        data.error === 'booking_conflict' ? 'ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกเวลาใหม่'
          : data.error === 'insufficient_credit' ? 'เครดิตไม่พอ'
          : data.error === 'slot_unavailable' ? 'ช่วงเวลาไม่ว่าง กรุณาเลือกใหม่'
          : 'จองไม่สำเร็จ ลองใหม่อีกครั้ง',
      );
      // reload slots หลัง conflict เพื่อความสดใหม่
      void loadSlots();
    } catch {
      setBookError('เครือข่ายขัดข้อง ลองใหม่อีกครั้ง');
    } finally {
      setBooking(false);
    }
  }

  if (!canBook) {
    return (
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        {purchaseStatus === 'pending'
          ? 'รายการนี้ยังไม่ชำระเงิน — เปิดใช้เครดิตหลังชำระเสร็จ'
          : purchaseStatus === 'depleted'
            ? 'ใช้เครดิตครบแล้ว ซื้อแพ็กเกจใหม่ได้ที่หน้าโปรไฟล์ครู'
            : 'แพ็กเกจนี้ไม่พร้อมใช้งาน'}
        <div className="mt-3">
          <Link href="/packages" className="text-sm font-bold text-pink-600 hover:underline">← กลับแพ็กเกจของฉัน</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CalendarPlus className="h-4 w-4 text-pink-600" />
          จองด้วยเครดิต (เหลือ {sessionsRemaining} ครั้ง)
        </h3>
        <button
          type="button"
          onClick={() => void loadSlots()}
          className="text-xs font-bold text-pink-600 hover:underline"
        >
          รีเฟรชตาราง
        </button>
      </div>

      {slotsLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดช่วงเวลาว่าง…
        </div>
      ) : slotsError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{slotsError}</p>
      ) : slots.length === 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          ครูยังไม่เปิดตารางสอน หรือไม่มีช่วงเวลาว่างในช่วง 60 วันข้างหน้า
        </p>
      ) : (
        <>
          {/* เลือกวัน */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {dates.slice(0, 14).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  selectedDate === d
                    ? 'border-pink-300 bg-pink-50 text-pink-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-pink-200'
                }`}
              >
                {formatSlotDay(d)}
              </button>
            ))}
          </div>

          {/* เลือกเวลา */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {slotsForDate.map((s) => (
              <button
                key={`${s.scheduleId}-${s.date}-${s.startTime}`}
                type="button"
                onClick={() => setSelectedSlot(s)}
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                  selectedSlot === s
                    ? 'border-pink-400 bg-pink-50 text-pink-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200'
                }`}
              >
                {s.startTime}–{s.endTime}
              </button>
            ))}
          </div>

          {bookError && (
            <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{bookError}</p>
          )}

          <div className="mt-4">
            <Button onClick={handleBook} disabled={!selectedSlot || booking} isLoading={booking}>
              {booking ? 'กำลังจอง…' : (
                <>
                  <Ticket className="mr-1.5 h-4 w-4" />
                  ยืนยันจองด้วยเครดิต 1 ครั้ง
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
