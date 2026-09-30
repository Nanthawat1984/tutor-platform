import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { Megaphone, Pin, Eye, EyeOff, Trash2, Plus, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout, SectionCard, EmptyState } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';
import { ANNOUNCEMENT_CATEGORIES } from '@/lib/announcements';
import { formatDate } from '@/lib/utils';

import Link from 'next/link';
import {
  createAnnouncement,
  togglePinAnnouncement,
  togglePublishAnnouncement,
  deleteAnnouncement,
} from './actions';

// ── Page ────────────────────────────────────────────────────
export default async function AdminAnnouncementsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  await requireRole(['admin']);

  const snap = await db.collection(COLLECTIONS.ANNOUNCEMENTS)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const announcements = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  return (
    <DashboardLayout
      title="ข่าวสารจากศูนย์"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <p className="mb-6 text-sm text-slate-500">
        ประกาศ/ประชาสัมพันธ์โครงการ จะแสดงบนแดชบอร์ดผู้ปกครองและครูตามกลุ่มเป้าหมาย
      </p>

      {/* ── ฟอร์มสร้างข่าว ── */}
      <SectionCard title="สร้างประกาศใหม่">
        <form action={createAnnouncement} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">หัวข้อ *</label>
            <input
              name="title"
              required
              maxLength={120}
              placeholder="เช่น โปรโมชันแพ็กเกจเรียน ลดสูงสุด 20%"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">เนื้อหา *</label>
            <textarea
              name="body"
              required
              maxLength={2000}
              rows={4}
              placeholder="รายละเอียดข่าว/โปรโมชัน..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">กลุ่มเป้าหมาย</label>
              <select
                name="audience"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              >
                <option value="all">ทุกคน</option>
                <option value="parent">ผู้ปกครอง</option>
                <option value="teacher">ครู</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">หมวด</label>
              <select
                name="category"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              >
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">ลิงก์เพิ่มเติม (ไม่บังคับ)</label>
              <input
                name="linkUrl"
                placeholder="/packages"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isPinned" className="h-4 w-4 rounded border-slate-300 text-pink-600" />
            ปักหมุดไว้บนสุดของแดชบอร์ด
          </label>
          <Button type="submit" className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> เผยแพร่ประกาศ
          </Button>
        </form>
      </SectionCard>

      {/* ── รายการประกาศ ── */}
      <div className="mt-6">
        <SectionCard title={`ประกาศทั้งหมด (${announcements.length})`}>
          {announcements.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-7 w-7" />}
              title="ยังไม่มีประกาศ"
              description="สร้างประกาศแรกของคุณด้านบนได้เลย"
            />
          ) : (
            <div className="space-y-3">
              {announcements.map((a: any) => {
                const date = a.publishedAt?.toDate?.() || a.createdAt?.toDate?.() || null;
                return (
                  <Card key={a.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.isPinned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-bold text-pink-700">
                              <Pin className="h-3 w-3" /> ปักหมุด
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${a.published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {a.published ? 'เผยแพร่' : 'ฉบับร่าง'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {a.audience === 'all' ? 'ทุกคน' : a.audience === 'parent' ? 'ผู้ปกครอง' : 'ครู'}
                          </span>
                          {date && <span className="text-xs text-slate-400">{formatDate(date, 'd MMM yyyy')}</span>}
                        </div>
                        <p className="mt-1.5 font-bold text-slate-900">{a.title}</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link href={`/admin/announcements/${a.id}`}>
                          <Button variant="outline" size="sm" className="inline-flex items-center gap-1.5">
                            <Pencil className="h-3.5 w-3.5" /> แก้ไข
                          </Button>
                        </Link>
                        <form action={togglePinAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="next" value={String(!a.isPinned)} />
                          <Button type="submit" variant="outline" size="sm" className="inline-flex items-center gap-1.5">
                            <Pin className="h-3.5 w-3.5" /> {a.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                          </Button>
                        </form>
                        <form action={togglePublishAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="next" value={String(!a.published)} />
                          <Button type="submit" variant="outline" size="sm" className="inline-flex items-center gap-1.5">
                            {a.published ? <><EyeOff className="h-3.5 w-3.5" /> ซ่อน</> : <><Eye className="h-3.5 w-3.5" /> เผยแพร่</>}
                          </Button>
                        </form>
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variant="outline" size="sm" className="inline-flex items-center gap-1.5 text-red-600 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" /> ลบ
                          </Button>
                        </form>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
