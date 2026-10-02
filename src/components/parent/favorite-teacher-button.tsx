'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2 } from 'lucide-react';

const ERROR_TH: Record<string, string> = {
  teacher_not_found: 'ไม่พบข้อมูลครู',
  parents_only: 'ฟีเจอร์นี้สำหรับผู้ปกครองเท่านั้น',
  invalid_input: 'ข้อมูลไม่ถูกต้อง',
  rate_limited: 'กดถี่เกินไป กรุณารอสักครู่',
  offline: 'ออฟไลน์อยู่ — กรุณาลองใหม่',
};

// ปุ่มหัวใจเพิ่ม/ลบครูในรายการโปรด (ชื่อฟอร์ไดต์เป็นข้อมูลส่วนตัวของผู้ปกครอง)
// initialFavorite มาจาก server เพื่อไม่ให้กระพริบสถานะผิดตอนโหลดหน้าแรก
export default function FavoriteTeacherButton({
  teacherId,
  initialFavorite = false,
  variant = 'icon',
  className,
}: {
  teacherId: string;
  initialFavorite?: boolean;
  variant?: 'icon' | 'button';
  className?: string;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading) return;
    const next = !favorite;
    setFavorite(next); // optimistic
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, favorite: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; favorite?: boolean };
      if (!res.ok) {
        setFavorite(!next); // rollback
        setError(ERROR_TH[data.error || ''] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setFavorite(data.favorite !== false);
      router.refresh();
    } catch {
      setFavorite(!next);
      setError(ERROR_TH.offline);
    } finally {
      setLoading(false);
    }
  }

  const label = favorite ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด';

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-pressed={favorite}
        title={label}
        className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-xl border-2 font-bold transition-colors disabled:opacity-60 ${
          variant === 'button' ? 'px-4 text-sm' : 'h-10 w-10'
        } ${
          favorite
            ? 'border-rose-200 bg-rose-50 text-rose-600'
            : 'border-pink-100 bg-white text-slate-400 hover:border-pink-200 hover:text-rose-400'
        }`}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />}
        {variant === 'button' && <span>{favorite ? 'อยู่ในรายการโปรด' : 'เพิ่มในรายการโปรด'}</span>}
      </button>
      {error && <p className="mt-1 text-[11px] font-semibold text-rose-600">{error}</p>}
    </div>
  );
}