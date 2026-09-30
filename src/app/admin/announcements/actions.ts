'use server';

// Server actions สำหรับจัดการข่าวสารจากศูนย์ (admin)
// ต้องแยกไฟล์ — Next.js page.tsx export ได้เฉพาะ default/metadata/dynamic
import { revalidatePath } from 'next/cache';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';
import type { AnnouncementAudience, AnnouncementCategory } from '@/lib/announcements';

// ── รูปประกอบประกาศ ──
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * อัปโหลดรูปประกอบประกาศไป Storage (public read — เนื้อหา PR ไม่ใช่ข้อมูลส่วนบุคคล)
 * คืน { url, path } หรือ null ถ้าไม่ได้แนบ/ไฟล์ไม่ผ่านเงื่อนไข
 */
async function uploadAnnouncementImage(file: unknown): Promise<{ url: string; path: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!IMAGE_TYPES.has(file.type)) return null;
  if (file.size > IMAGE_MAX_BYTES) return null;
  const storage = getServerStorage();
  if (!storage) return null;
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `announcement-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.bucket(bucketName).file(path).save(buffer, {
    contentType: file.type,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });
  return { url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media`, path };
}

/** ลบรูปเก่าออกจาก Storage (ใช้ตอนแก้ไข/ลบประกาศ — fail-safe) */
async function deleteAnnouncementImage(imagePath: unknown) {
  if (typeof imagePath !== 'string' || !imagePath) return;
  try {
    const storage = getServerStorage();
    if (!storage) return;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    await storage.bucket(bucketName).file(imagePath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error('announcement image delete failed:', error instanceof Error ? error.message : error);
  }
}

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
  let image: { url: string; path: string } | null = null;
  try {
    image = await uploadAnnouncementImage(formData.get('image'));
  } catch (error) {
    console.error('announcement image upload failed:', error instanceof Error ? error.message : error);
  }
  await db.collection(COLLECTIONS.ANNOUNCEMENTS).add({
    title,
    body,
    audience: parseAudience(formData.get('audience')),
    category: parseCategory(formData.get('category')),
    isPinned: formData.get('isPinned') === 'on',
    linkUrl: parseInternalLink(formData.get('linkUrl')),
    imageUrl: image?.url ?? null,
    imagePath: image?.path ?? null,
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
  const ref = db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id);
  const snap = await ref.get();
  await ref.delete();
  await deleteAnnouncementImage(snap.data()?.imagePath);
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
  const ref = db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id);
  const existing = await ref.get();
  const prevImagePath = existing.data()?.imagePath;
  let image: { url: string; path: string } | null = null;
  try {
    image = await uploadAnnouncementImage(formData.get('image'));
  } catch (error) {
    console.error('announcement image upload failed:', error instanceof Error ? error.message : error);
  }
  const updateData: Record<string, unknown> = {
    title,
    body,
    audience: parseAudience(formData.get('audience')),
    category: parseCategory(formData.get('category')),
    isPinned: formData.get('isPinned') === 'on',
    linkUrl: parseInternalLink(formData.get('linkUrl')),
    updatedBy: session.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // แนบรูปใหม่ → เก็บ + ลบรูปเก่า; ไม่แนบ → คงรูปเดิมไว้
  if (image) {
    updateData.imageUrl = image.url;
    updateData.imagePath = image.path;
    await deleteAnnouncementImage(prevImagePath);
  }
  await ref.update(updateData);
  revalidateAll();
  revalidatePath(`/admin/announcements/${id}`);
}
