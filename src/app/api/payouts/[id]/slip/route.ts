import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';

export const runtime = 'nodejs';

/**
 * หลักฐานการโอนของ payout
 *
 * ใน Firestore เก็บเป็น path (`payout-slips/{payoutId}/...`) ไม่ใช่ URL ตรง ๆ
 * เพราะ signed URL หมดอายุ — ครูต้องกลับมาเปิดหลักฐานได้นาน ๆ หลังแอดมินอัปโหลด
 * จึง mint URL สั้น ๆ 15 นาทีต่อครั้งที่เปิด ทั้งแอดมินและครูเจ้าของ payout
 * ที่ต้องเป็นคนดูได้
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  const storage = getServerStorage();
  if (!db || !storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const payoutSnap = await db.collection(COLLECTIONS.PAYOUTS).doc(id).get();
  if (!payoutSnap.exists) return NextResponse.json({ error: 'payout_not_found' }, { status: 404 });

  const payout = payoutSnap.data() as { teacherId?: string; slipPath?: string; slipURL?: string };

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const isAdmin = userSnap.exists && userSnap.data()?.role === 'admin';
  if (!isAdmin && payout.teacherId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ข้อมูลที่บันทึกไว้ก่อนย้ายไปเก็บเป็น path — URL เดิมยังเปิดได้ถ้ายังไม่หมดอายุ
  if (!payout.slipPath) {
    if (payout.slipURL) return NextResponse.redirect(payout.slipURL);
    return NextResponse.json({ error: 'slip_not_available' }, { status: 404 });
  }

  if (!payout.slipPath.startsWith(`payout-slips/${id}/`)) {
    return NextResponse.json({ error: 'slip_not_available' }, { status: 404 });
  }

  try {
    const fileRef = storage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`).file(payout.slipPath);
    const [exists] = await fileRef.exists();
    if (!exists) return NextResponse.json({ error: 'slip_not_found' }, { status: 404 });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Payout slip view error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'slip_view_failed' }, { status: 500 });
  }
}