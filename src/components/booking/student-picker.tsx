'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { PlusCircle } from 'lucide-react';

interface SavedStudent {
  id: string;
  name: string;
  level?: string;
}

interface StudentPickerProps {
  students: SavedStudent[];
}

const NEW_STUDENT_VALUE = '__new__';

export function StudentPicker({ students }: StudentPickerProps) {
  const [mode, setMode] = useState<string>(students.length > 0 ? students[0].id : NEW_STUDENT_VALUE);
  const isNew = mode === NEW_STUDENT_VALUE;

  return (
    <div className="space-y-4">
      <input type="hidden" name="student_id" value={mode} />

      {students.length > 0 && (
        <div>
          <label htmlFor="student-select" className="mb-1.5 block text-sm font-semibold text-slate-700">
            เลือกนักเรียน
          </label>
          <select
            id="student-select"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="min-h-[44px] w-full cursor-pointer appearance-none rounded-xl border border-violet-100 bg-white/90 px-4 py-2.5 text-base text-slate-900 shadow-inner-lg transition-all duration-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100/60 sm:text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.level ? ` (${s.level})` : ''}
              </option>
            ))}
            <option value={NEW_STUDENT_VALUE}>＋ เพิ่มนักเรียนใหม่...</option>
          </select>
        </div>
      )}

      {isNew ? (
        <div className="space-y-4">
          <Input label="ชื่อ-นามสกุล นักเรียน *" name="student_name" required placeholder="ชื่อลูกคุณ" />
          <Input label="ระดับชั้น" name="student_level" placeholder="เช่น ป.4, ม.2" />
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <PlusCircle className="h-3.5 w-3.5" />
            นักเรียนคนนี้จะถูกบันทึกในรายชื่อของคุณสำหรับการจองครั้งต่อไป
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          ใช้ข้อมูลนักเรียนที่บันทึกไว้แล้ว — เปลี่ยนได้ที่{' '}
          <a href="/my-students" className="font-bold text-violet-600 hover:underline">จัดการรายชื่อลูก</a>
        </p>
      )}
    </div>
  );
}
