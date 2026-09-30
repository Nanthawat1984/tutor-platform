'use server';

// Server actions สำหรับจัดการข่าวสารจากศูนย์ (admin)
// ต้องแยกไฟล์ — Next.js page.tsx export ได้เฉพาะ default/metadata/dynamic
import { revalidatePath } from 'next/cache';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { requireRole } from '@/lib/auth/guards';

function revalidateAll() {
  revalidatePath('/admin/announcements');
  revalidatePath('/my-bookings');
  revalidatePath('/dashboard');
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
    audience: String(formData.get('audience') || 'all'),
    category: String(formData.get('category') || 'general'),
    isPinned: formData.get('isPinned') === 'on',
    linkUrl: String(formData.get('linkUrl') || '').trim() || null,
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
