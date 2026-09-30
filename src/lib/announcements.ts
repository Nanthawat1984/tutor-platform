// ข่าวสารจากศูนย์ (announcements) — ประชาสัมพันธ์โครงการ / ข่าวสารทั่วไป
// แอดมินเขียน (published=true) → แสดงบนแดชบอร์ดผู้ปกครองและครู
import { COLLECTIONS } from '@/types/firestore';

export type AnnouncementAudience = 'all' | 'parent' | 'teacher';
export type AnnouncementCategory = 'promotion' | 'news' | 'general';

export const ANNOUNCEMENT_CATEGORIES: { id: AnnouncementCategory; label: string }[] = [
  { id: 'promotion', label: 'ประชาสัมพันธ์โครงการ' },
  { id: 'news', label: 'ข่าวสารทั่วไป' },
  { id: 'general', label: 'ประกาศจากศูนย์' },
];

export function categoryLabel(id: string): string {
  return ANNOUNCEMENT_CATEGORIES.find((c) => c.id === id)?.label || 'ประกาศ';
}

/** จำนวนรูปสูงสุดต่อประกาศ */
export const ANNOUNCEMENT_MAX_IMAGES = 5;

/** รายการรูปทั้งหมดของประกาศ (รองรับทั้งรูปเดียว legacy + images[]) */
export function announcementImages(a: any): { url: string; path?: string }[] {
  if (Array.isArray(a.images) && a.images.length > 0) return a.images;
  if (a.imageUrl) return [{ url: a.imageUrl, path: a.imagePath || undefined }];
  return [];
}

/** ดึงข่าวที่ฉายอยู่สำหรับกลุ่มเป้าหมาย — pin ก่อน แล้วเรียงตามวันที่ล่าสุด */
// NOTE: ห้าม where+orderBy หลาย field โดยไม่มี composite index — จะพังบน production
// (failed-precondition) จึงดึงแบบ index-free แล้วกรอง+เรียงใน memory
export async function getActiveAnnouncements(
  db: any,
  role: 'parent' | 'teacher' | 'admin',
  limit = 5,
): Promise<any[]> {
  const snap = await db.collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('published', '==', true)
    .limit(50)
    .get();
  const nowMs = Date.now();
  return snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((a: any) => {
      if (a.audience !== 'all' && a.audience !== role) return false;
      const exp = a.expiresAt?.toMillis?.();
      if (typeof exp === 'number' && exp < nowMs) return false; // หมดอายุ → ซ่อน
      return true;
    })
    .sort((a: any, b: any) => {
      const pinned = (b.isPinned === true ? 1 : 0) - (a.isPinned === true ? 1 : 0);
      if (pinned !== 0) return pinned;
      const ta = a.publishedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const tb = b.publishedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    })
    .slice(0, limit);
}
