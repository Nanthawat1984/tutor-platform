import { getServerDb } from '@/lib/firebase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout, SectionCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';
import { announcementImages } from '@/lib/announcements';
import { AnnouncementForm } from '@/components/admin/announcement-form';

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
        <AnnouncementForm
          mode="edit"
          announcementId={a.id}
          submitLabel="บันทึกการแก้ไข"
          defaults={{
            title: a.title || '',
            body: a.body || '',
            audience: a.audience || 'all',
            category: a.category || 'general',
            linkUrl: a.linkUrl || '',
            isPinned: a.isPinned === true,
          }}
          existingImages={announcementImages(a)}
        />
        <p className="mt-3 text-xs text-slate-400">
          {a.published ? 'ประกาศนี้กำลังเผยแพร่อยู่ — การแก้ไขจะมีผลทันที' : 'ประกาศนี้เป็นฉบับร่าง'}
        </p>
      </SectionCard>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
