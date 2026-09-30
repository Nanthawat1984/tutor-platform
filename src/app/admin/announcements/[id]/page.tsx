import { getServerDb } from '@/lib/firebase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout, SectionCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';
import { ANNOUNCEMENT_CATEGORIES, announcementImages } from '@/lib/announcements';
import { updateAnnouncement } from '../actions';

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  await requireRole(['admin']);
  const { id } = await params;

  const snap = await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).get();
  if (!snap.exists) notFound();
  const a = { id: snap.id, ...snap.data() } as any;

  return (
    <DashboardLayout
      title="แก้ไขประกาศ"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName="แอดมิน"
    >
      <Link
        href="/admin/announcements"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-pink-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> กลับรายการประกาศ
      </Link>

      <SectionCard title="แก้ไขข้อความประกาศ">
        <form action={updateAnnouncement} className="space-y-3">
          <input type="hidden" name="id" value={a.id} />
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">หัวข้อ *</label>
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={a.title || ''}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">เนื้อหา *</label>
            <textarea
              name="body"
              required
              maxLength={2000}
              rows={6}
              defaultValue={a.body || ''}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">กลุ่มเป้าหมาย</label>
              <select
                name="audience"
                defaultValue={a.audience || 'all'}
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
                defaultValue={a.category || 'general'}
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
                defaultValue={a.linkUrl || ''}
                placeholder="/packages"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">รูปประกอบ (เลือกได้หลายรูป — JPG/PNG/WebP ไม่เกิน 5MB ต่อรูป, สูงสุด 5 รูป)</label>
            {(() => {
              const imgs = announcementImages(a);
              if (imgs.length === 0) return null;
              return (
                <div className="mb-2 flex flex-wrap gap-2">
                  {imgs.map((img, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={img.path || img.url || i} src={img.url} alt={`${a.title} (${i + 1})`} className="h-20 rounded-lg border border-slate-200 object-cover" />
                  ))}
                </div>
              );
            })()}
            <input
              type="file"
              name="image"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-pink-700"
            />
            <p className="mt-1 text-[11px] text-slate-400">ถ้าเลือกไฟล์ใหม่ รูปเดิมทั้งหมดจะถูกแทนที่ (ไม่เลือก = คงรูปเดิม)</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isPinned"
              defaultChecked={a.isPinned === true}
              className="h-4 w-4 rounded border-slate-300 text-pink-600"
            />
            ปักหมุดไว้บนสุดของแดชบอร์ด
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" className="inline-flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> บันทึกการแก้ไข
            </Button>
            <span className="text-xs text-slate-400">
              {a.published ? 'ประกาศนี้กำลังเผยแพร่อยู่ — การแก้ไขจะมีผลทันที' : 'ประกาศนี้เป็นฉบับร่าง'}
            </span>
          </div>
        </form>
      </SectionCard>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
