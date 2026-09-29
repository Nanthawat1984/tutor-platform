'use client';

import { useAuthReady, useUnreadTotal } from '@/hooks/useChat';

// ตัวเลขข้อความค้างบนเมนูข้อความ — ฟังสด ไม่ต้องรีเฟรชหน้า
export default function UnreadMessagesBadge() {
  const { uid } = useAuthReady();
  const { total } = useUnreadTotal(uid);

  if (!total) return null;

  return (
    <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-pink-500 px-1.5 text-[11px] font-bold text-white">
      {total > 99 ? '99+' : total}
    </span>
  );
}
