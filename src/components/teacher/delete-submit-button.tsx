'use client';

import { Trash2 } from 'lucide-react';

interface DeleteSubmitButtonProps {
  label?: string;
}

/**
 * ปุ่ม submit ภายใน <form action={serverAction}> ที่ถามยืนยันก่อนลบ
 * ใช้คู่กับ hidden input ที่หน้า server component จัดให้
 */
export default function DeleteSubmitButton({ label = 'ลบ' }: DeleteSubmitButtonProps) {
  return (
    <button
      type="submit"
      title={label}
      aria-label={label}
      onClick={(e) => {
        if (!window.confirm('ยืนยันการลบ? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
          e.preventDefault();
        }
      }}
      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}