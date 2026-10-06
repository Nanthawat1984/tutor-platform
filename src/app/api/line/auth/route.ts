import { NextRequest, NextResponse } from 'next/server';
import { getServerAuth, getServerDb } from '@/lib/firebase/server';
import { verifyLineIdToken, LineTokenVerificationError } from '@/lib/line/liff';
import { COLLECTIONS } from '@/types/firestore';

/**
 * POST /api/line/auth
 * Body: { idToken: LIFF ID token }
 *
 * เข้าสู่ระบบด้วย LINE สำหรับผู้ใช้ที่เปิดแอปในเบราว์เซอร์ในแอป LINE
 * (Google popup ถูกบล็อกใน webview นี้)
 *
 * 1) ตรวจ LIFF ID token กับ LINE verify endpoint (iss/aud/exp ครบ)
 * 2) หาบัญชี TutorPlatform ที่ผูก lineUserId นี้ไว้
 * 3) ออก Firebase custom token ให้ client เอาไป signInWithCustomToken
 *
 * ความปลอดภัย: ล็อกอินได้เฉพาะบัญชีที่เคยเชื่อม LINE ผ่านหน้า
 * /my-profile (มี Firebase session + LIFF verification) มาก่อนแล้วเท่านั้น
 * บัญชีที่ยังไม่เชื่อมจะได้ 404 line_not_linked พร้อมคำแนะนำ
 */
export async function POST(request: NextRequest) {
  const auth = getServerAuth();
  const db = getServerDb();
  if (!auth || !db) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
  if (!idToken || idToken.length > 4096) {
    return NextResponse.json({ error: 'invalid_id_token' }, { status: 400 });
  }

  let lineUserId: string;
  try {
    lineUserId = (await verifyLineIdToken(idToken)).lineUserId;
  } catch (error) {
    if (error instanceof LineTokenVerificationError) {
      return NextResponse.json({ error: 'invalid_line_token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'line_verification_failed' }, { status: 502 });
  }

  // lineUserId เขียนได้เฉพาะ /api/line/link (ตรวจ Firebase session แล้ว) —
  // การ query ด้วยค่าที่ verify แล้วจึงเป็นการพิสูจน์ตัวตนที่เชื่อถือได้
  const linked = await db.collection(COLLECTIONS.USERS)
    .where('lineUserId', '==', lineUserId)
    .limit(2)
    .get();

  if (linked.empty) {
    return NextResponse.json(
      { error: 'line_not_linked' },
      { status: 404 },
    );
  }
  // ผูกซ้ำหลายบัญชีไม่ควรเกิด (route link กันไว้แล้ว) — ปฏิเสธเพื่อความชัดเจน
  if (linked.size > 1) {
    return NextResponse.json({ error: 'line_account_ambiguous' }, { status: 409 });
  }

  const uid = linked.docs[0].id;
  const role = linked.docs[0].data()?.role;
  if (role !== 'parent' && role !== 'teacher') {
    return NextResponse.json({ error: 'line_role_not_allowed' }, { status: 403 });
  }

  // custom token อายุสั้น (1 ชม. โดย Firebase) — client แลกเป็น session ทันที
  const customToken = await auth.createCustomToken(uid, { role, via: 'line' });

  return NextResponse.json({ customToken });
}
