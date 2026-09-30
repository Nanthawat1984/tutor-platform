'use server';

// Server actions สำหรับจัดการข่าวสารจากศูนย์ (admin)
// ต้องแยกไฟล์ — Next.js page.tsx export ได้เฉพาะ default/metadata/dynamic
import { revalidatePath } from 'next/cache';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';
import type { AnnouncementAudience, AnnouncementCategory } from '@/lib/announcements';

function revalidateAll() {
  revalidatePath('/admin/announcements');
  revalidatePath('/my-bookings');
  revalidatePath('/dashboard');
}

// ── input validators (union type เป็น source of truth — ค่าผิด fallback เป็นค่าปลอดภัย) ──
const AUDIENCES: AnnouncementAudience[] = ['all', 'parent', 'teacher'];
const CATEGORIES: AnnouncementCategory[] = ['promotion', 'news', 'general'];

function parseAudience(value: FormDataEntryValue | null): AnnouncementAudience {
  return AUDIENCES.includes(value as AnnouncementAudience) ? (value as AnnouncementAudience) : 'all';
}

function parseCategory(value: FormDataEntryValue | null): AnnouncementCategory {
  return CATEGORIES.includes(value as AnnouncementCategory) ? (value as AnnouncementCategory) : 'general';
}

/** ลิงก์ภายในเท่านั้น (path เริ่มด้วย / ไม่มี scheme อื่น) — กัน javascript:/data: URL จาก XSS */
function parseInternalLink(value: FormDataEntryValue | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#]*$/.test(raw) && !raw.includes('..') ? raw : null;
}

export async function createAnnouncement(formData: FormData) {
  const { session } = await requireRole(['admin']);
  const db = getServerDb();
  if (!db) return;
  const title = String(formData.get('title') || '').trim().slice(0, 120);
  const body = String(formData.get('body') || '').trim().slice(0, 2000);
  if (!title || !body) return;
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).add({
    title,
    body,
    audience: parseAudience(formData.get('audience')),
    category: parseCategory(formData.get('category')),
    isPinned: formData.get('isPinned') === 'on',
    linkUrl: parseInternalLink(formData.get('linkUrl')),
    published: true,
    publishedAt: Timestamp.fromMillis(Date.now()),
    expiresAt: null,
    createdBy: session.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidateAll();
}

export async function togglePinAnnouncement(formData: FormData) {
  await requireRole(['admin']);
  const db = getServerDb();
  if (!db) return;
  const id = String(formData.get('id') || '');
  const next = formData.get('next') === 'true';
  if (!id) return;
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).update({
    isPinned: next,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidateAll();
}

export async function togglePublishAnnouncement(formData: FormData) {
  await requireRole(['admin']);
  const db = getServerDb();
  if (!db) return;
  const id = String(formData.get('id') || '');
  const next = formData.get('next') === 'true';
  if (!id) return;
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).update({
    published: next,
    publishedAt: next ? Timestamp.fromMillis(Date.now()) : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidateAll();
}

export async function deleteAnnouncement(formData: FormData) {
  await requireRole(['admin']);
  const db = getServerDb();
  if (!db) return;
  const id = String(formData.get('id') || '');
  if (!id) return;
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).delete();
  revalidateAll();
}

export async function updateAnnouncement(formData: FormData) {
  const { session } = await requireRole(['admin']);
  const db = getServerDb();
  if (!db) return;
  const id = String(formData.get('id') || '');
  const title = String(formData.get('title') || '').trim().slice(0, 120);
  const body = String(formData.get('body') || '').trim().slice(0, 2000);
  if (!id || !title || !body) return;
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).update({
    title,
    body,
    audience: parseAudience(formData.get('audience')),
    category: parseCategory(formData.get('category')),
    isPinned: formData.get('isPinned') === 'on',
    linkUrl: parseInternalLink(formData.get('linkUrl')),
    updatedBy: session.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidateAll();
  revalidatePath(`/admin/announcements/${id}`);
}
