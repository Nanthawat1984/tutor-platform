'use client';

import { GraduationCap, Sparkles, Users } from 'lucide-react';

export type SelectableRole = 'parent' | 'teacher';

export const ROLE_OPTIONS: Array<{
  value: SelectableRole;
  icon: typeof Users;
  emoji: string;
  title: string;
  desc: string;
  gradient: string;
}> = [
  {
    value: 'parent',
    icon: Users,
    emoji: '👨‍👩‍👧',
    title: 'ผู้ปกครอง',
    desc: 'ค้นหาครูให้ลูกหลาน ติดตามผลการเรียน',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    value: 'teacher',
    icon: GraduationCap,
    emoji: '📚',
    title: 'ครูพิเศษ',
    desc: 'เปิดสอน จัดการตาราง รับรายได้',
    gradient: 'from-pink-500 to-rose-500',
  },
];

interface RoleSelectorProps {
  value: SelectableRole;
  onChange: (role: SelectableRole) => void;
  disabled?: boolean;
}

export function RoleSelector({ value, onChange, disabled = false }: RoleSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-3">
        <Sparkles className="inline h-4 w-4 text-pink-500 mr-1.5" />
        สมัครในฐานะ
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-3xl border-2 bg-white/80 p-4 text-left transition-all ${
                selected
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-pink-100 hover:border-pink-300 hover:bg-pink-50/60'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${option.gradient} shadow-sm`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{option.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{option.desc}</p>
              </div>
              <div className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${selected ? 'border-pink-500' : 'border-pink-200 bg-white'}`}>
                <div className={`h-2.5 w-2.5 rounded-full bg-pink-500 transition-all ${selected ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}