import { NextRequest, NextResponse } from 'next/server';
import { getServerStorage } from '@/lib/firebase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let adminUid = 'admin';
  try {
    adminUid = (await requireAdmin()).session.uid;
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 20 uploads / 10 min per admin
  sweepRateLimitBuckets();
  const limit = checkRateLimit(`payout-slip:${adminUid}`, 20, 10 * 60_000);
  if (!limit.ok) {
    logEvent('warn', 'payout_slip_rate_limited', { uid: adminUid });
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const storage = getServerStorage();
  if (!storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const payoutId = String(formData.get('payoutId') || '').trim();
  const file = formData.get('file');
  if (!payoutId) return NextResponse.json({ error: 'missing_payout_id' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });

  const extByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  if (!extByType[file.type]) return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large' }, { status: 400 });

  try {
    const path = `payout-slips/${payoutId}/slip-${Date.now()}.${extByType[file.type]}`;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const fileRef = storage.bucket(bucketName).file(path);
    await fileRef.save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      metadata: { contentType: file.type },
    });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return NextResponse.json({ url, path });
  } catch (error) {
    logEvent('error', 'payout_slip_upload_failed', { payoutId });
    console.error('Payout slip upload error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
