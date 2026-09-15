'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

interface Message {
  id: string;
  senderRole: string;
  text: string;
  mine: boolean;
}

// Booking-scoped chat box — polls every 10s, no realtime infra needed at this scale.
export default function ChatBox({ bookingId }: { bookingId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/chat?bookingId=${encodeURIComponent(bookingId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.items) ? data.items : []);
    } catch { /* offline */ }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, text }),
      });
      if (res.ok) {
        setDraft('');
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="max-h-80 min-h-40 overflow-y-auto space-y-2 p-4">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อความ — เริ่มคุยกันได้เลย</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.mine ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}>
              {m.text}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-slate-100 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          maxLength={1000}
          placeholder="พิมพ์ข้อความ…"
          className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-pink-600 px-4 text-white disabled:opacity-50"
          aria-label="ส่งข้อความ"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
