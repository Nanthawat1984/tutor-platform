'use client';

// Realtime chat hooks — client อ่านข้อความผ่าน onSnapshot (ข้อความอีกฝั่งโผล่ทันที)
// และเขียนแค่ presence ของตัวเอง (typing / lastSeen / lastRead)
// การ "ส่งข้อความ" ยังวิ่งผ่าน API เพื่อกันสแปม นับโควตา และยิงแจ้งเตือน

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { connectEmulators, getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/client';
import {
  CHAT_HEARTBEAT_MS,
  CHAT_LIVE_WINDOW,
  CHAT_ONLINE_WINDOW_MS,
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  PRESENCE_SUBCOLLECTION,
  type ChatAudioExtension,
  type ChatMessage,
  type ChatMessageType,
  type ChatPresence,
} from '@/types/chat';

const TYPING_IDLE_MS = 3_000;
const READ_DEBOUNCE_MS = 1_200;

function toMillis(value: unknown): number {
  const millis = (value as any)?.toMillis?.();
  if (typeof millis === 'number') return millis;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function toMessage(id: string, conversationId: string, data: DocumentData): ChatMessage {
  return {
    id,
    conversationId,
    senderId: data.senderId,
    senderRole: data.senderRole,
    type: (data.type || 'text') as ChatMessageType,
    text: data.text || '',
    audio: data.audio || null,
    clientMsgId: data.clientMsgId || id,
    createdAt: toMillis(data.createdAt),
  };
}

export function sortMessages(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));
}

/** รอให้ Firebase Auth ฟื้น session จาก IndexedDB ก่อนยิง Firestore (สำคัญตอน refresh หน้า) */
export function useAuthReady(): { uid: string | null; ready: boolean } {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    connectEmulators();
    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      setUid(auth.currentUser.uid);
      setReady(true);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setReady(true);
    });
  }, []);

  return { uid, ready };
}

export interface ChatStreamState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** เครือื่อยื่นใน Firestore → true = ข้อมูลอาจไม่ครบ */
  offline: boolean;
}

/** ฟังข้อความใหม่แบบสด ๆ — ข้อความเก่ากว่าหน้าต่างสุดท้ายโหลดเพิ่มด้วย useOlderMessages */
export function useConversationStream(conversationId: string, uid: string | null): ChatStreamState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!uid || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION),
      orderBy('createdAt', 'desc'),
      limit(CHAT_LIVE_WINDOW),
    );

    return onSnapshot(
      q,
      (snap: QuerySnapshot) => {
        setMessages(sortMessages(snap.docs.map((d) => toMessage(d.id, conversationId, d.data()))));
        setOffline(false);
        setError(null);
        setLoading(false);
      },
      (err: Error) => {
        // permission-denied = ยังไม่ล็อกอิน หรือไม่ใช่คู่สนทนา — ไม่ต้องรบกวนผู้ใช้ซ้ำ
        setError((err as { code?: string }).code === 'permission-denied' ? 'forbidden' : 'stream_failed');
        setOffline(true);
        setLoading(false);
      },
    );
  }, [conversationId, uid]);

  return { messages, loading, error, offline };
}

export interface OlderMessagesState {
  older: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  loadOlder: () => void;
}

/** โหลดข้อความย้อนหลังทีละหน้า (เก่ากว่า beforeMs) */
export function useOlderMessages(conversationId: string, beforeMs: number | null): OlderMessagesState {
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const loadOlder = useCallback(async () => {
    if (inFlight.current || !beforeMs) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages?before=${beforeMs}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: ChatMessage[] = Array.isArray(data.items) ? data.items : [];
      setOlder((prev) => sortMessages([...items, ...prev]));
      setHasMore(Boolean(data.hasMore));
    } catch {
      // ออฟไลน์ — กดโหลดซ้ำได้
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [conversationId, beforeMs]);

  return { older, hasMore, loading, loadOlder };
}

export interface PresenceState {
  otherTyping: boolean;
  otherOnline: boolean;
  otherLastSeenAt: number | null;
  otherLastReadAt: number | null;
}

const EMPTY_PRESENCE: PresenceState = {
  otherTyping: false,
  otherOnline: false,
  otherLastSeenAt: null,
  otherLastReadAt: null,
};

/**
 * presence ของทั้งสองฝั่ง — heartbeat เพื่อขึ้นสถานะ "ออนไลน์" และส่งสัญญาณ
 * "กำลังพิมพ์" แบบสองทาง พร้อมทำเครื่องหมายว่าอ่านถึงข้อความไหนแล้ว
 */
export function usePresence(
  conversationId: string,
  uid: string | null,
  otherId: string | null,
  options: { typing: boolean; latestMessageAt: number | null; latestFromOther: boolean },
): PresenceState {
  const [state, setState] = useState<PresenceState>(EMPTY_PRESENCE);
  const { typing, latestMessageAt, latestFromOther } = options;
  const typingRef = useRef(typing);
  typingRef.current = typing;

  // ── อ่าน presence ของอีกฝั่ง
  useEffect(() => {
    if (!conversationId || !otherId) {
      setState(EMPTY_PRESENCE);
      return;
    }
    const db = getFirebaseDb();
    const ref = doc(db, CONVERSATIONS_COLLECTION, conversationId, PRESENCE_SUBCOLLECTION, otherId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState(EMPTY_PRESENCE);
          return;
        }
        const data = snap.data() as ChatPresence;
        const lastSeenAt = toMillis(data.lastSeenAt);
        setState({
          otherTyping: Boolean(data.typing),
          otherOnline: lastSeenAt > 0 && Date.now() - lastSeenAt < CHAT_ONLINE_WINDOW_MS,
          otherLastSeenAt: lastSeenAt || null,
          otherLastReadAt: toMillis(data.lastReadAt) || null,
        });
      },
      () => setState(EMPTY_PRESENCE),
    );
  }, [conversationId, otherId]);

  // ── heartbeat: ยืนยันว่ายังอยู่ในห้องคุย
  useEffect(() => {
    if (!uid || !conversationId) return;
    const db = getFirebaseDb();
    const ref = doc(db, CONVERSATIONS_COLLECTION, conversationId, PRESENCE_SUBCOLLECTION, uid);
    const beat = () => {
      setDoc(ref, { lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {
        // presence เป็นข้อมูลเสริม — ล้มเหลวได้โดยไม่กระทบการแชท
      });
    };
    beat();
    const timer = setInterval(beat, CHAT_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      setDoc(ref, { typing: false, lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
    };
  }, [uid, conversationId]);

  // ── สัญญาณกำลังพิมพ์
  useEffect(() => {
    if (!uid || !conversationId) return;
    const db = getFirebaseDb();
    const ref = doc(db, CONVERSATIONS_COLLECTION, conversationId, PRESENCE_SUBCOLLECTION, uid);
    setDoc(ref, { typing }, { merge: true }).catch(() => {});
  }, [uid, conversationId, typing]);

  // ── ทักทายเมื่อข้อความใหม่ของอีกฝั่งเข้ามาบนหน้าจอที่มองเห็นจริง
  useEffect(() => {
    if (!uid || !conversationId || !latestMessageAt || !latestFromOther) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const db = getFirebaseDb();
    const ref = doc(db, CONVERSATIONS_COLLECTION, conversationId, PRESENCE_SUBCOLLECTION, uid);
    setDoc(ref, { lastReadAt: serverTimestamp() }, { merge: true }).catch(() => {});

    const timer = setTimeout(() => {
      fetch(`/api/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST' })
        .catch(() => {});
    }, READ_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [uid, conversationId, latestMessageAt, latestFromOther]);

  return state;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface SendPayload {
  clientMsgId: string;
  type: ChatMessageType;
  text?: string;
  audio?: {
    ext: ChatAudioExtension;
    url: string;
    durationMs: number;
    size: number;
    peaks: number[];
  };
}

export async function sendChatMessage(conversationId: string, payload: SendPayload): Promise<SendResult> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || 'send_failed' };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export function newClientMsgId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** ตัวเลขข้อความค้างรวมบนเมนู — ฟังสดจาก conversations ตัวเดียวกับหน้ารายการ */
export function useUnreadTotal(uid: string | null): { total: number; loading: boolean } {
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTotal(0);
      setLoading(false);
      return;
    }
    const db = getFirebaseDb();
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('participantIds', 'array-contains', uid),
    );

    return onSnapshot(
      q,
      (snap) => {
        setTotal(
          snap.docs.reduce((sum, d) => {
            const data = d.data();
            const unread = data.teacherId === uid ? data.unreadTeacher : data.unreadParent;
            return sum + (Number(unread) || 0);
          }, 0),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);

  return { total, loading };
}

/** เปิดห้องคุยกับครู (ฝั่งผู้ปกครอง) — เรียกซ้ำได้โดยได้ id เดิม */
export async function openConversationWithTeacher(
  teacherId: string,
  bookingId?: string,
): Promise<{ id: string | null; error?: string }> {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId, bookingId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { id: null, error: data.error || 'open_failed' };
    return { id: data.conversation?.id ?? null };
  } catch {
    return { id: null, error: 'offline' };
  }
}

export function useTypingSignal(enabled: boolean) {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signal = useCallback(() => {
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTyping(false);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  return { typing, signal, stop };
}
