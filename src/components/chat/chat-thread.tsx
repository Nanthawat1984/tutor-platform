'use client';

// ห้องคุยแบบสด — ข้อความเดินเข้ามาผ่าน Firestore onSnapshot ทันทีที่อีกฝั่งส่ง
// ฝั่งเราส่งเองผ่าน API (กันสแปม/นับโควตา/แจ้งเตือน) แล้วแสดงทันทีแบบ optimistic

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ChevronUp, Loader2, Send, WifiOff } from 'lucide-react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import MessageBubble, { type MessageStatus } from './message-bubble';
import AudioRecorder, { type RecordedClip } from './audio-recorder';
import { getFirebaseStorage } from '@/lib/firebase/client';
import {
  useAuthReady,
  useConversationStream,
  useOlderMessages,
  usePresence,
  useTypingSignal,
  newClientMsgId,
  sendChatMessage,
  sortMessages,
} from '@/hooks/useChat';
import {
  CHAT_LIVE_WINDOW,
  CHAT_MAX_LENGTH,
  audioPathFor,
  type ChatMessage,
  type ChatRole,
} from '@/types/chat';
import { dayLabel, isSameDay, lastSeenLabel } from '@/lib/chat/format';
import { getInitials } from '@/lib/utils';

interface ChatThreadProps {
  conversationId: string;
  viewerUid: string;
  viewerRole: ChatRole;
  otherId: string;
  otherName: string;
  otherPhotoURL: string | null;
  otherRole: ChatRole;
  contextLabel: string | null;
  backHref: string;
  bookingHref?: string | null;
  /** ประวัติจาก SSR — แสดงทันทีโดยไม่ต้องรอสตรีม */
  initialMessages?: ChatMessage[];
}

interface PendingMessage {
  message: ChatMessage;
  status: MessageStatus;
  retry?: () => void;
}

const SEND_ERROR_TEXT: Record<string, string> = {
  rate_limited: 'ส่งถี่เกินไป กรุณารอสักครู่',
  offline: 'ออฟไลน์อยู่ — ยังไม่ได้ส่ง กดลองใหม่เมื่อกลับมาออนไลน์',
  send_failed: 'ส่งไม่สำเร็จ กรุณาลองใหม่',
  audio_too_large: 'ไฟล์เสียงใหญ่เกินไป',
  invalid_duration: 'ไฟล์เสียงยาวเกินไป',
  invalid_audio: 'ส่งไฟล์เสียงไม่สำเร็จ',
};

export default function ChatThread({
  conversationId,
  viewerUid,
  viewerRole,
  otherId,
  otherName,
  otherPhotoURL,
  otherRole,
  contextLabel,
  backHref,
  bookingHref,
  initialMessages = [],
}: ChatThreadProps) {
  const { ready } = useAuthReady();
  const streamUid = ready ? viewerUid : null;
  const { messages, loading, error, offline } = useConversationStream(
    conversationId,
    streamUid,
    initialMessages,
  );

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const { typing, signal, stop } = useTypingSignal(true);

  const { older, hasMore, loading: loadingOlder, loadOlder } = useOlderMessages(
    conversationId,
    messages[0]?.createdAt ?? null,
  );

  const latest = messages[messages.length - 1] ?? null;
  const presence = usePresence(conversationId, streamUid, otherId, {
    typing,
    latestMessageAt: latest?.createdAt ?? null,
    latestFromOther: Boolean(latest && latest.senderId !== viewerUid),
  });

  const lastOwnMessage = useMemo(
    () => [...messages].reverse().find((m) => m.senderId === viewerUid) ?? null,
    [messages, viewerUid],
  );
  const readByOther = Boolean(
    lastOwnMessage && presence.otherLastReadAt && presence.otherLastReadAt >= lastOwnMessage.createdAt,
  );

  // ── เลื่อนลงล่างเมื่อมีข้อความใหม่ (ถ้าผู้ใช้อยู่ใกล้ล่างอยู่)
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, pending.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversationId]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // ── รวมข้อความจาก Firestore กับที่กำลังส่ง (ตัวที่ Firestore ส่งมาแล้วไม่ต้องแสดงซ้ำ)
  const merged = useMemo(() => {
    const liveIds = new Set(messages.map((m) => m.id));
    const inFlight = pending
      .filter((p) => !liveIds.has(p.message.id))
      .map((p) => p.message);
    return sortMessages([...older, ...messages, ...inFlight]);
  }, [messages, older, pending]);

  const statusById = useMemo(() => {
    const map = new Map<string, MessageStatus>();
    pending.forEach((p) => map.set(p.message.id, p.status));
    return map;
  }, [pending]);

  const setStatus = useCallback((id: string, status: MessageStatus) => {
    setPending((prev) => prev.map((p) => (p.message.id === id ? { ...p, status } : p)));
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.message.id !== id));
  }, []);

  const deliver = useCallback(
    async (message: ChatMessage) => {
      const result = await sendChatMessage(conversationId, {
        clientMsgId: message.clientMsgId,
        type: message.type,
        text: message.text,
        audio: message.audio
          ? {
            ext: message.audio.ext,
            url: message.audio.url,
            durationMs: message.audio.durationMs,
            size: message.audio.size,
            peaks: message.audio.peaks,
          }
          : undefined,
      });

      if (result.ok) {
        setStatus(message.id, 'sent');
        // Firestore จะส่งของจริงมาให้เร็ว ๆ นี้ — ถ้ายังไม่มี ก็เก็บไว้แสดงต่อ
        setTimeout(() => removePending(message.id), 8_000);
        setNotice(null);
        return;
      }

      setNotice(SEND_ERROR_TEXT[result.error || ''] || SEND_ERROR_TEXT.send_failed);
      setPending((prev) =>
        prev.map((p) => (p.message.id === message.id
          ? {
            ...p,
            status: 'failed',
            retry: () => {
              removePending(message.id);
              void deliver(message);
            },
          }
          : p)),
      );
    },
    [conversationId, removePending, setStatus],
  );

  function sendText() {
    const text = draft.trim();
    if (!text) return;

    const clientMsgId = newClientMsgId();
    const optimistic: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: viewerUid,
      senderRole: viewerRole,
      type: 'text',
      text,
      audio: null,
      clientMsgId,
      createdAt: Date.now(),
    };

    setPending((prev) => [...prev, { message: optimistic, status: 'pending' }]);
    setDraft('');
    stop();
    nearBottomRef.current = true;
    void deliver(optimistic);
  }

  async function sendAudio(clip: RecordedClip) {
    if (sendingAudio || !ready) return;
    setSendingAudio(true);
    setNotice(null);

    const clientMsgId = newClientMsgId();
    const path = audioPathFor(conversationId, viewerUid, clientMsgId, clip.extension);
    const optimistic: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: viewerUid,
      senderRole: viewerRole,
      type: 'audio',
      text: '',
      audio: {
        path,
        url: '',
        ext: clip.extension,
        durationMs: clip.durationMs,
        size: clip.size,
        peaks: clip.peaks,
      },
      clientMsgId,
      createdAt: Date.now(),
    };

    setPending((prev) => [...prev, { message: optimistic, status: 'pending' }]);
    nearBottomRef.current = true;

    try {
      const fileRef = storageRef(getFirebaseStorage(), path);
      await uploadBytes(fileRef, clip.blob, { contentType: clip.blob.type });
      const url = await getDownloadURL(fileRef);
      const withUrl: ChatMessage = {
        ...optimistic,
        audio: { ...optimistic.audio!, url },
      };
      setPending((prev) => prev.map((p) => (p.message.id === clientMsgId ? { ...p, message: withUrl } : p)));
      await deliver(withUrl);
    } catch {
      setNotice('ส่งเสียงไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่');
      removePending(clientMsgId);
    } finally {
      setSendingAudio(false);
    }
  }

  // ── เรียงลำดับพร้อมหัวข้อวัน
  const rows = useMemo(() => {
    const out: Array<
      { kind: 'day'; key: string; label: string }
      | { kind: 'message'; message: ChatMessage; status: MessageStatus; tail: boolean }
    > = [];
    let lastDay: number | null = null;
    merged.forEach((message, index) => {
      if (lastDay === null || !isSameDay(lastDay, message.createdAt)) {
        out.push({ kind: 'day', key: `day-${message.createdAt}-${index}`, label: dayLabel(message.createdAt) });
        lastDay = message.createdAt;
      }
      const next = merged[index + 1];
      out.push({
        kind: 'message',
        message,
        status: statusById.get(message.id) || 'sent',
        tail: !next || next.senderId !== message.senderId,
      });
    });
    return out;
  }, [merged, statusById]);

  const canLoadOlder = older.length > 0 || messages.length >= CHAT_LIVE_WINDOW;

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── หัวห้องคุย */}
      <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <Link
          href={backHref}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:hidden"
          aria-label="กลับ"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="relative shrink-0">
          {otherPhotoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otherPhotoURL} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
              {getInitials(otherName)}
            </span>
          )}
          {presence.otherOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{otherName}</p>
          <p className="truncate text-[11px] text-slate-500">
            {presence.otherTyping ? (
              <span className="font-semibold text-pink-600">กำลังพิมพ์…</span>
            ) : presence.otherOnline ? (
              <span className="font-semibold text-emerald-600">ออนไลน์</span>
            ) : (
              lastSeenLabel(presence.otherLastSeenAt)
              || (otherRole === 'teacher' ? 'คุณครู' : 'ผู้ปกครอง')
            )}
          </p>
        </div>

        {contextLabel && (
          <span className="hidden max-w-[40%] truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 md:block">
            {contextLabel}
          </span>
        )}
        {bookingHref && (
          <Link
            href={bookingHref}
            className="shrink-0 rounded-lg border border-pink-200 px-2.5 py-1 text-[11px] font-semibold text-pink-600 hover:bg-pink-50"
          >
            ดูการจอง
          </Link>
        )}
      </header>

      {/* ── ข้อความ */}
      <div ref={scrollerRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-5">
        {canLoadOlder && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:text-pink-600 disabled:opacity-60"
            >
              {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              ดูข้อความย้อนหลัง
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-pink-400" />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">ยังไม่มีข้อความ — เริ่มคุยกันได้เลย</p>
            <p className="mt-1 text-xs text-slate-400">
              {otherRole === 'teacher'
                ? 'สอบถามเรื่องคอร์ส เวลาว่าง หรือรายละเอียดการเรียนได้เลยค่ะ'
                : 'สอบถามเรื่องเวลาเรียน หรือรายละเอียดต่าง ๆ ได้เลยครับ'}
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          {rows.map((row) =>
            row.kind === 'day' ? (
              <div key={row.key} className="my-3 flex justify-center">
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
                  {row.label}
                </span>
              </div>
            ) : (
              <div key={row.message.id} className="relative">
                <MessageBubble
                  message={row.message}
                  mine={row.message.senderId === viewerUid}
                  status={row.status}
                  readByOther={row.message.id === lastOwnMessage?.id && readByOther}
                  showTail={row.tail}
                />
                {row.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => pending.find((p) => p.message.id === row.message.id)?.retry?.()}
                    className="absolute -top-1 right-1 flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow"
                  >
                    <AlertCircle className="h-2.5 w-2.5" />
                    ลองใหม่
                  </button>
                )}
              </div>
            ),
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* ── สถานะการเชื่อมต่อ */}
      {(offline || notice) && (
        <p className="flex items-center gap-1.5 border-t border-amber-100 bg-amber-50 px-4 py-1.5 text-[11px] font-semibold text-amber-800">
          <WifiOff className="h-3 w-3 shrink-0" />
          {notice || (error
            ? 'ยังรับข้อความสดไม่ได้ชั่วคราว — ข้อความที่ส่งไว้แล้วยังอยู่ครบ และจะเด้งเองเมื่อต่อได้'
            : 'ขาดการเชื่อมต่อชั่วคราว — ข้อความจะกลับมาเองเมื่อเน็ตกลับมา')}
        </p>
      )}

      {/* ── ช่องพิมพ์ */}
      <div className="border-t border-slate-100 bg-white p-2.5 sm:p-3">
        <div className="flex items-end gap-2">
          <AudioRecorder disabled={!ready} sending={sendingAudio} onSend={sendAudio} />
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, CHAT_MAX_LENGTH));
              if (e.target.value) signal();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            onBlur={stop}
            rows={1}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={`พิมพ์ข้อความถึง${otherRole === 'teacher' ? 'คุณครู' : 'ผู้ปกครอง'}…`}
            className="max-h-32 min-h-[44px] w-full resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-pink-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={!draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-button disabled:opacity-40"
            aria-label="ส่งข้อความ"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {presence.otherTyping && (
          <p className="mt-1.5 flex items-center gap-1.5 pl-1 text-[11px] text-slate-400">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:240ms]" />
            </span>
            {otherName} กำลังพิมพ์
          </p>
        )}
      </div>
    </div>
  );
}
