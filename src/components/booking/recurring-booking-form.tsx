'use client';

// RecurringBookingForm — จองแบบสัปดาห์ละครั้ง (สูงสุด 8 คาบ)
// ผู้ปกครองเลือก "รูปแบบวัน/เวลา" ที่ครูเปิดไว้ แล้วระบบสร้างการจองทุกสัปดาห์ให้อัตโนมัติ
// ยิงไปที่ POST /api/bookings/recurring — API จะตรวจการชนกับตารางครูให้รายคาบ
// หมายเหตุ: API นี้สร้างการจองสถานะ pending โดยยังไม่สร้าง payment
// แต่ละคาบจึงไปชำระเงินแยกกันได้ที่ /bookings (payment ถูกสร้างตอนกดชำระ)

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import type { AvailableBookingSlot } from '@/lib/booking/availability';

interface SavedStudent {
  id: string;
  name: string;
  level?: string | null;
}

interface RecurringBookingFormProps {
  courseId: string;
  courseTitle: string;
  pricePerSession: number;
  slots: AvailableBookingSlot[];
  students: SavedStudent[];
  errorCode?: string;
}

const WEEKDAYS_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const WEEK_OPTIONS = [2, 3, 4, 5, 6, 7, 8];

const ERROR_TH: Record<string, string> = {
  invalid_input: 'กรุณาเลือกนักเรียนและช่วงเวลาให้ครบก่อนยืนยัน',
  invalid_slot: 'ช่วงเวลาที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่',
  invalid_date: 'วันที่ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่',
  invalid_time: 'เวลาที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่',
  course_not_found: 'ไม่พบคอร์สเรียนนี้',
  course_inactive: 'คอร์สนี้ปิดรับสมัครแล้ว',
  forbidden: 'คุณไม่มีสิทธิ์จองให้นักเรียนคนนี้',
  unauthorized: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  server_not_configured: 'ระบบยังไม่พร้อมให้บริการ ลองใหม่ภายหลัง',
  booking_conflict: 'ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกรูปแบบวัน/เวลาอื่น',
};

function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay();
}

function formatThaiDate(date: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00+07:00`));
}

interface SlotPattern {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  dates: string[];
}

export function RecurringBookingForm({
  courseId,
  courseTitle,
  pricePerSession,
  slots,
  students,
  errorCode,
}: RecurringBookingFormProps) {
  const router = useRouter();

  const patterns = useMemo<SlotPattern[]>(() => {
    const map = new Map<string, SlotPattern>();
    for (const slot of slots) {
      const weekday = weekdayOf(slot.date);
      const key = `${weekday}|${slot.startTime}|${slot.endTime}`;
      const existing = map.get(key);
      if (existing) {
        existing.dates.push(slot.date);
      } else {
        map.set(key, {
          key,
          weekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          dates: [slot.date],
        });
      }
    }
    return [...map.values()]
      .map((pattern) => ({ ...pattern, dates: [...pattern.dates].sort() }))
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  }, [slots]);

  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [patternKey, setPatternKey] = useState(patterns[0]?.key || '');
  const [weeks, setWeeks] = useState(4);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    errorCode ? ERROR_TH[errorCode] || 'เกิดข้อผิดพลาด กรุณาลองใหม่' : null,
  );

  const selected = patterns.find((pattern) => pattern.key === patternKey) || null;
  const occurrences = selected ? selected.dates.slice(0, weeks) : [];
  const total = pricePerSession * occurrences.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!studentId) {
      setError('กรุณาเลือกนักเรียนก่อน');
      return;
    }
    if (!selected || occurrences.length === 0) {
      setError('กรุณาเลือกรูปแบบวันและเวลา');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          studentId,
          dates: occurrences.map((date) => ({
            date,
            startTime: selected.startTime,
            endTime: selected.endTime,
          })),
          notes: notes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: string[];
        skipped?: { date: string; reason: string }[];
      };
      if (!res.ok) {
        setError(ERROR_TH[data.error || ''] || 'สร้างการจองไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      const created = Array.isArray(data.created) ? data.created.length : 0;
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      if (created === 0) {
        setError(
          ERROR_TH[data.skipped?.[0]?.reason || ''] || 'ทุกช่วงเวลาที่เลือกถูกจองไปแล้ว กรุณาเลือกรูปแบบอื่น',
        );
        return;
      }
      router.push(`/bookings?recurring=created&count=${created}&skipped=${skipped}`);
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  const hasSlots = patterns.length > 0;
  const hasStudents = students.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="flex items-start gap-3 border-2 border-violet-200 bg-violet-50/50">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <CalendarRange className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-violet-900">จองแบบสัปดาห์ละครั้ง — {courseTitle}</h3>
          <p className="mt-1 text-xs text-violet-700">
            เลือกวันและเวลาที่ต้องการ ระบบจะสร้างการจองให้ทุกสัปดาห์ (สูงสุด 8 คาบ)
            โดยตรวจวันว่างกับตารางครูให้อัตโนมัติ — แต่ละคาบชำระเงินแยกกัน
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">ข้อมูลนักเรียน</h3>
          <Link
            href="/my-students"
            className="inline-flex items-center gap-1 text-xs font-bold text-pink-600 hover:underline"
          >
            <Users className="h-3.5 w-3.5" />
            จัดการรายชื่อลูก
          </Link>
        </div>
        {hasStudents ? (
          <Select
            label="เลือกนักเรียน"
            name="student_id"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            options={students.map((student) => ({
              value: student.id,
              label: `${student.name}${student.level ? ` (${student.level})` : ''}`,
            }))}
            helperText="การจองแบบเป็นชุดใช้ได้เฉพาะนักเรียนที่บันทึกไว้แล้ว"
          />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ยังไม่มีรายชื่อนักเรียน — กรุณาเพิ่มรายชื่อลูกที่{' '}
            <Link href="/my-students" className="font-bold underline">
              จัดการรายชื่อลูก
            </Link>{' '}
            ก่อนจองแบบสัปดาห์ละครั้ง
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold text-gray-900">รูปแบบวันและเวลา</h3>
        {hasSlots ? (
          <>
            <Select
              label="วันและเวลาที่ครูเปิดไว้"
              name="slot_pattern"
              value={patternKey}
              onChange={(event) => setPatternKey(event.target.value)}
              options={patterns.map((pattern) => ({
                value: pattern.key,
                label: `ทุกวัน${WEEKDAYS_TH[pattern.weekday]} ${pattern.startTime} - ${pattern.endTime} น.`,
              }))}
              helperText="ระบบจะนับวันว่างจากตารางครูโดยตรง"
            />
            <Select
              label="จำนวนสัปดาห์"
              name="weeks"
              value={String(weeks)}
              onChange={(event) => setWeeks(Number(event.target.value) || 4)}
              options={WEEK_OPTIONS.map((value) => ({ value: String(value), label: `${value} สัปดาห์` }))}
              helperText="สูงสุด 8 คาบต่อการจองหนึ่งครั้ง"
            />
            {occurrences.length > 0 && (
              <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-4">
                <p className="text-sm font-bold text-slate-800">
                  จะจองทั้งหมด {occurrences.length} คาบ
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {occurrences.map((date) => (
                    <li key={date} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
                      {formatThaiDate(date)} เวลา {selected?.startTime} - {selected?.endTime} น.
                    </li>
                  ))}
                </ul>
                {selected && occurrences.length < selected.dates.length && (
                  <p className="mt-2 text-xs text-slate-400">
                    มีวันว่างมากกว่าที่เลือกไว้ — เพิ่มจำนวนสัปดาห์ได้หากต้องการจองต่อ
                  </p>
                )}
                <p className="mt-3 border-t border-pink-100 pt-3 text-sm font-bold text-pink-700">
                  รวมค่าคอร์ส {formatCurrency(total)}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ขณะนี้ไม่มีช่วงเวลาว่างที่จองแบบสัปดาห์ละครั้งได้ กรุณากลับมาเลือกใหม่ภายหลัง
          </p>
        )}
        <Textarea
          label="หมายเหตุถึงครู (ถ้ามี)"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="เช่น ต้องการเน้นเรื่อง..."
        />
      </Card>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {error}
        </p>
      )}

      <div className="responsive-actions">
        <Button type="submit" disabled={submitting || !hasSlots || !hasStudents} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'กำลังสร้างการจอง...' : `ยืนยันการจอง ${occurrences.length} คาบ`}
        </Button>
        <Link
          href={`/bookings/new?course_id=${encodeURIComponent(courseId)}`}
          className="w-full sm:w-auto"
        >
          <Button type="button" variant="outline" className="w-full sm:w-auto">
            จองครั้งเดียวแทน
          </Button>
        </Link>
      </div>
    </form>
  );
}
