'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: number | null;
}

// Bell + dropdown polling /api/notifications. Reuses the existing notifications
// collection (written by triggers + payment logic) — no new data model.
export default function NotificationBell({ roleHref = '/notifications' }: { roleHref?: string }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const res = await fetch('/api/notifications?limit=8', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setUnread(Number(data.unreadCount) || 0);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch { /* offline — keep stale count */ }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);

  async function markAll() {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'readAll' }),
    }).catch(() => undefined);
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-pink-100 bg-white/80 text-slate-600 shadow-sm transition-colors hover:bg-pink-50 hover:text-pink-600"
        aria-label={unread > 0 ? `การแจ้งเตือน (${unread} ยังไม่อ่าน)` : 'การแจ้งเตือน'}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-pink-100 bg-white p-2 shadow-elevated">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-bold text-slate-800">การแจ้งเตือน</p>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs font-semibold text-pink-600 hover:underline">
                  อ่านทั้งหมด
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className={`rounded-xl px-3 py-2.5 ${n.isRead ? '' : 'bg-pink-50/70'}`}>
                    <p className="text-xs font-bold text-slate-800">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <a href={roleHref} className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-bold text-pink-600 hover:bg-pink-50">
              ดูทั้งหมด →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
