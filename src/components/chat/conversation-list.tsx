'use client';

// รายการห้องคุย — ข้อความล่าสุดและตัวเลขค้างอัปเดตสดผ่าน onSnapshot
// เซิร์ฟเวอร์เรนเดอร์รายการครั้งแรกไว้ให้ SEO/ความเร็ว ฝั่ง client ค่อยต่อให้สด

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuthReady } from '@/hooks/useChat';
import { CONVERSATIONS_COLLECTION, type ConversationSummary } from '@/types/chat';
import { listTimeLabel } from '@/lib/chat/format';
import { getInitials } from '@/lib/utils';

function toSummary(doc: any, viewerUid: string): ConversationSummary {
  const data = doc.data();
  const teacherSide = data.teacherId === viewerUid;
  return {
    id: doc.id,
    parentId: data.parentId,
    teacherId: data.teacherId,
    otherId: teacherSide ? data.parentId : data.teacherId,
    otherName: teacherSide ? data.parentName : data.teacherName,
    otherPhotoURL: teacherSide ? data.parentPhotoURL : data.teacherPhotoURL,
    otherRole: teacherSide ? 'parent' : 'teacher',
    contextLabel: data.contextLabel || null,
    bookingId: data.bookingId || null,
    lastMessageText: data.lastMessageText || '',
    lastMessageType: data.lastMessageType || 'text',
    lastMessageAt: data.lastMessageAt?.toMillis?.() ?? null,
    lastSenderId: data.lastSenderId ?? null,
    unread: Number(teacherSide ? data.unreadTeacher : data.unreadParent) || 0,
  };
}

export default function ConversationList({
  initial,
  viewerUid,
}: {
  initial: ConversationSummary[];
  viewerUid: string;
}) {
  const { ready } = useAuthReady();
  const [live, setLive] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    const db = getFirebaseDb();
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('participantIds', 'array-contains', viewerUid),
    );
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => toSummary(d, viewerUid));
        items.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
        setLive(items);
      },
      () => setLive(null), // ใช้ข้อมูลจากเซิร์ฟเวอร์ต่อ
    );
  }, [ready, viewerUid]);

  const items = useMemo(() => live ?? initial, [live, initial]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-pink-200 bg-white/60 py-14 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-pink-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">ยังไม่มีห้องสนทนา</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
          กดปุ่ม “ส่งข้อความครู” บนหน้าโปรไฟล์ครู เพื่อเริ่มคุยกันได้เลย
          ไม่ต้องรอให้มีการจอง
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {items.map((item) => {
        const preview = item.lastMessageText
          || (item.otherRole === 'teacher' ? 'เริ่มคุยกับคุณครูได้เลย' : 'เริ่มคุยกับผู้ปกครองได้เลย');
        return (
          <li key={item.id}>
            <Link
              href={`/messages/${item.id}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-pink-50/50"
            >
              <div className="relative shrink-0">
                {item.otherPhotoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.otherPhotoURL} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
                    {getInitials(item.otherName)}
                  </span>
                )}
                {item.otherRole === 'teacher' && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-violet-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    ครู
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">{item.otherName}</p>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                    {listTimeLabel(item.lastMessageAt)}
                  </span>
                </div>
                {item.contextLabel && (
                  <p className="truncate text-[11px] text-violet-500">{item.contextLabel}</p>
                )}
                <p className={`truncate text-xs ${item.unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
                  {item.lastSenderId === viewerUid ? 'คุณ: ' : ''}
                  {preview}
                </p>
              </div>

              {item.unread > 0 && (
                <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-pink-600 px-1.5 text-[11px] font-bold text-white">
                  {item.unread > 99 ? '99+' : item.unread}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
