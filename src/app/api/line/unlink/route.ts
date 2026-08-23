import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAuth, getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
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

  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    lineUserId: FieldValue.delete(),
    lineLinkedAt: FieldValue.delete(),
    lineNotificationEnabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ linked: false });
}
