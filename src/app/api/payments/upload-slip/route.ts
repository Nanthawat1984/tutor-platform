import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

export const runtime = 'nodejs';

/**
 * POST /api/payments/upload-slip
 * multipart/form-data: { bookingId, file }
 * อัปโหลดสลิปโอนเงินผ่าน Admin SDK (ข้าม Storage rules ของ client)
 * — ตรวจ session + ยืนยันว่าเป็นผู้ปกครองเจ้าของการจอง
 * คืนค่า: { url }
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  const storage = getServerStorage();
  if (!db || !storage) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const bookingId = String(formData.get('bookingId') || '');
  const file = formData.get('file');

  if (!bookingId) return NextResponse.json({ error: 'missing_booking_id' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  }

  // ตรวจสอบ booking + เจ้าของ
  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: 'booking_not_found' }, { status: 404 });
  }
  const booking = bookingSnap.data() as any;
  if (booking?.parentId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const path = `payment-slips/${bookingId}/slip-${Date.now()}.${extByType[file.type]}`;

    const bucketName =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = storage.bucket(bucketName);
    const fileRef = bucket.file(path);
    await fileRef.save(buffer, {
      contentType: file.type,
      metadata: { contentType: file.type },
    });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
    return NextResponse.json({ url, path });
  } catch (error) {
    console.error('Slip upload error:', (error as any)?.message || error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
