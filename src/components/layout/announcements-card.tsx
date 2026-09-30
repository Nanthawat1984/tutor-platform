import Link from 'next/link';
import type { ReactNode } from 'react';
import { Megaphone, Newspaper, PartyPopper, Pin, ExternalLink } from 'lucide-react';
import { SectionCard } from '@/components/layout/dashboard';
import { categoryLabel } from '@/lib/announcements';
import { formatDate } from '@/lib/utils';

const CATEGORY_ICON: Record<string, ReactNode> = {
  promotion: <PartyPopper className="h-4 w-4 text-pink-600" />,
  news: <Newspaper className="h-4 w-4 text-blue-600" />,
  general: <Megaphone className="h-4 w-4 text-amber-600" />,
};

/** ข่าวสารจากศูนย์ — ใช้ร่วมกันบนแดชบอร์ดผู้ปกครอง (my-bookings) และครู (dashboard) */
export function AnnouncementsCard({
  announcements,
  title = 'ข่าวสารจากศูนย์',
}: {
  announcements: any[];
  title?: string;
}) {
  if (announcements.length === 0) return null;

  return (
    <div className="mt-6">
      <SectionCard title={title}>
        <div className="space-y-3">
        {announcements.map((a: any) => {
          const date = a.publishedAt?.toDate?.() || a.createdAt?.toDate?.() || null;
          return (
            <div
              key={a.id}
              className={`rounded-2xl border p-4 ${a.isPinned ? 'border-pink-200 bg-pink-50/50' : 'border-slate-100 bg-slate-50/60'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORY_ICON[a.category] || <Megaphone className="h-4 w-4 text-slate-500" />}
                <span className="text-xs font-bold text-slate-500">{categoryLabel(a.category)}</span>
                {a.isPinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-bold text-pink-700">
                    <Pin className="h-3 w-3" /> ปักหมุด
                  </span>
                )}
                {date && (
                  <span className="text-xs text-slate-400">{formatDate(date, 'd MMM yyyy')}</span>
                )}
              </div>
              <p className="mt-1.5 font-bold text-slate-900">{a.title}</p>
              {a.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>}
              {a.linkUrl && (
                <Link
                  href={a.linkUrl}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-pink-600 hover:underline"
                >
                  อ่านต่อ <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
        </div>
      </SectionCard>
    </div>
  );
}
