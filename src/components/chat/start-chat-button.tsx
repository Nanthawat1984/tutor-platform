'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openConversationWithParent, openConversationWithTeacher } from '@/hooks/useChat';

const ERROR_TEXT: Record<string, string> = {
  teacher_not_found: 'ไม่พบข้อมูลครู',
  forbidden_party: 'เปิดห้องสนทนานี้ไม่ได้',
  forbidden: 'เปิดห้องสนทนานี้ไม่ได้',
  offline: 'ออฟไลน์อยู่ — กรุณาลองใหม่',
  open_failed: 'เปิดห้องสนทนาไม่สำเร็จ',
};

// ฝั่งผู้ปกครองส่ง teacherId · ฝั่งครูส่ง parentId (ต้องส่งอย่างใดอย่างหนึ่ง)
export default function StartChatButton({
  teacherId,
  parentId,
  bookingId,
  label = 'ส่งข้อความครู',
  variant = 'outline',
  className,
}: {
  teacherId?: string;
  parentId?: string;
  bookingId?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    const { id, error: failure } = teacherId
      ? await openConversationWithTeacher(teacherId, bookingId)
      : await openConversationWithParent(parentId!, bookingId);
    if (id) {
      router.push(`/messages/${id}`);
      return;
    }
    setError(ERROR_TEXT[failure || ''] || ERROR_TEXT.open_failed);
    setLoading(false);
  }

  return (
    <div className={className}>
      <Button onClick={open} disabled={loading} variant={variant} className="w-full sm:w-auto">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {loading ? 'กำลังเปิดห้องสนทนา…' : label}
      </Button>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
