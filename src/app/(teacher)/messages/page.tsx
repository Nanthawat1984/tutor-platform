import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { formatDate, formatTime } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import ChatBox from '@/components/chat/chat-box';

// Teacher inbox — one ChatBox per confirmed/upcoming booking (scoped by API).
export default async function TeacherMessagesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  await requireRole(['teacher']);

  const snap = await db.collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', session.uid)
    .where('status', 'in', ['confirmed', 'completed'])
    .orderBy('bookingDate', 'desc')
    .limit(20)
    .get();
  const bookings = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  return (
    <DashboardLayout
      title="ข้อความ"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      {bookings.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-7 w-7" />}
          title="ยังไม่มีบทสนทนา"
          description="เมื่อมีการจองที่ยืนยันแล้ว กล่องข้อความจะแสดงที่นี่"
        />
      ) : (
        <div className="space-y-5">
          {bookings.map((b: any) => (
            <Card key={b.id}>
              <p className="mb-2 text-sm font-bold text-slate-900">
                {b.studentName} • {b.courseTitle}
              </p>
              <p className="mb-3 text-xs text-slate-400">
                {formatDate(b.bookingDate, 'd MMM yyyy')} • {formatTime(b.startTime)} - {formatTime(b.endTime)}
              </p>
              <ChatBox bookingId={b.id} />
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
