import { notFound, redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { requireRole } from '@/lib/auth/guards';
import { PARENT_NAV_ITEMS, TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { DashboardLayout } from '@/components/layout/dashboard';
import ChatThread from '@/components/chat/chat-thread';
import { getConversation, otherParty } from '@/lib/chat/conversations';
import type { ChatRole } from '@/types/chat';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const { session, role } = await requireRole(['teacher', 'parent']);

  const { id } = await params;
  const conversation = await getConversation(db, id);
  if (!conversation) return notFound();
  // เข้าห้องคนอื่นไม่ได้ — ไม่บอกว่ามีห้องนี้อยู่จริงหรือไม่
  if (conversation.parentId !== session.uid && conversation.teacherId !== session.uid) {
    return notFound();
  }

  const other = otherParty(conversation, session.uid);
  const bookingHref = conversation.bookingId && role === 'parent' ? `/bookings/${conversation.bookingId}` : null;

  return (
    <DashboardLayout
      title="ข้อความ"
      navItems={role === 'teacher' ? TEACHER_NAV_ITEMS : PARENT_NAV_ITEMS}
      role={role}
      userName={session.displayName || (role === 'teacher' ? 'คุณครู' : 'ผู้ปกครอง')}
    >
      <div className="mx-auto max-w-3xl">
        <ChatThread
          conversationId={conversation.id}
          viewerUid={session.uid}
          viewerRole={role as ChatRole}
          otherId={other.otherId}
          otherName={other.otherName}
          otherPhotoURL={other.otherPhotoURL}
          otherRole={other.otherRole}
          contextLabel={conversation.contextLabel}
          backHref="/messages"
          bookingHref={bookingHref}
        />
      </div>
    </DashboardLayout>
  );
}

export const metadata = {
  title: 'สนทนา',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
