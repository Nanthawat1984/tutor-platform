import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';

export const runtime = 'nodejs';

/**
 * POST /api/packages/[id]/upload-slip
 * multipart/form-data: { file } — id ใน path คือ purchaseId
 * อัปโหลดสลิปแพ็กเกจผ่าน Admin SDK (ข้าม Storage rules)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  sweepRateLimitBuckets();
  const limit = checkRateLimit(`slip:pkg:${session.uid}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const db = getServerDb();
  const storage = getServerStorage();
  if (!db || !storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id: purchaseId } = await params;
  const purchaseSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId).get();
  if (!purchaseSnap.exists) return NextResponse.json({ error: 'purchase_not_found' }, { status: 404 });
  const purchase = purchaseSnap.data() as any;
  if (purchase.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (purchase.status !== 'pending') return NextResponse.json({ error: 'purchase_not_payable' }, { status: 409 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large' }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const path = `payment-slips/package-${purchaseId}/slip-${Date.now()}.${extByType[file.type]}`;
    const bucketName =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const fileRef = storage.bucket(bucketName).file(path);
    await fileRef.save(buffer, { contentType: file.type, metadata: { contentType: file.type } });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
    return NextResponse.json({ url, path });
  } catch (error) {
    logEvent('error', 'package_slip_upload_failed', { uid: session.uid, purchaseId });
    console.error('Package slip upload error:', (error as any)?.message || error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
