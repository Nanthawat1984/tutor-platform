import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAuth, getServerDb } from '@/lib/firebase/server';
import { verifyLineIdToken, LineTokenVerificationError } from '@/lib/line/liff';
import { assignLineRichMenu } from '@/lib/line/rich-menu';
import { COLLECTIONS } from '@/types/firestore';

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function maskLineUserId(lineUserId: string): string {
  if (lineUserId.length <= 6) return '******';
  return `${lineUserId.slice(0, 3)}…${lineUserId.slice(-3)}`;
}

export async function POST(request: NextRequest) {
  const auth = getServerAuth();
  const db = getServerDb();
  const token = getBearerToken(request);
  if (!auth || !db || !token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
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

  const existing = await db.collection(COLLECTIONS.USERS)
    .where('lineUserId', '==', lineUserId)
    .limit(2)
    .get();
  const owner = existing.docs.find((doc) => doc.id !== uid);
  if (owner) {
    return NextResponse.json({ error: 'line_account_already_linked' }, { status: 409 });
  }

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  const role = userSnap.data()?.role;

  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    lineUserId,
    lineLinkedAt: FieldValue.serverTimestamp(),
    lineNotificationEnabled: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (role === 'parent' || role === 'teacher') {
    try {
      await assignLineRichMenu(lineUserId, role);
    } catch {
      // Linking is authoritative; a missing/unavailable Rich Menu is retryable from setup.
    }
  }

  return NextResponse.json({ linked: true, lineUserIdMasked: maskLineUserId(lineUserId) });
}
