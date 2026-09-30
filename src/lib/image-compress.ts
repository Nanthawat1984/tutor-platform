// ย่อรูปในเบราว์เซอร์ก่อนอัปโหลดผ่าน server action
//
// ⚠️ เหตุผลที่ต้องย่อ: Next.js ตัดขนาด request body ของ server action ที่ next.config.js
// (experimental.serverActions.bodySizeLimit) ถ้าเกินลิมิตจะตอบ 500 ก่อนถึงตัว action เลย
// รูปจากมือถือมัก 2–5MB ถ้าส่งตรง ๆ แม้แค่รูปเดียวก็เกินลิมิต ทำให้หน้าโชว์
// "Application error: a server-side exception has occurred" โดยไม่บอกสาเหตุ
// ย่อเหลือ ~200–400KB ก่อนส่ง ทั้งอัปโหลดเร็วขึ้นและไม่ชนลิมิต

/** ด้านยาวสูงสุด (px) — แสดงบนการ์ดสูงไม่เกิน 320px ค่านี้มากพวยสำหรับ retina */
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_QUALITY = 0.82;
/** เล็กกว่านี้แล้วไม่คุ้มกับการย่อซ้ำ — ส่งไฟล์เดิมไปเลย */
export const IMAGE_COMPRESS_MIN_BYTES = 200 * 1024;

/**
 * ย่อรูปในเบราว์เซอร์เป็น JPEG (ขนาดไม่เกิน IMAGE_MAX_EDGE)
 * คืนไฟล์เดิมถ้าย่อไม่ได้ เช่น เบราว์เซอร์ไม่รองรับ createImageBitmap หรือไฟล์เสีย
 * ให้ฝั่ง server เป็นคนตัดสินใจปฏิเสธต่อ — ไม่ต้อง throw ทิ้งบนฝั่ง client
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= IMAGE_COMPRESS_MIN_BYTES) return file;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // PNG โปร่งใส → เติมพื้นขาวก่อน ไม่งั้นพื้นที่โปร่งใสจะกลายเป็นสีดำเมื่อแปลงเป็น JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY)
    );
    if (!blob) return file;

    const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** รูปแนบข่าวสาร: ไม่เกิน 5MB ต่อรูป (ขนาดไฟล์ที่ผู้ใช้เลือก ก่อนย่อ) */
export const ANNOUNCEMENT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const ANNOUNCEMENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** ขนาดรวมหลังย่อที่ยอมรับได้ — เผื่อ headroom ใต้ bodySizeLimit ของ Next.js */
export const ANNOUNCEMENT_IMAGES_TOTAL_MAX_BYTES = 6 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
