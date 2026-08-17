import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAuth, getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';

type AuthRole = 'parent' | 'teacher';

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function toAuthRole(value: unknown): AuthRole {
  return value === 'teacher' ? 'teacher' : 'parent';
}

async function verifyRequest(request: NextRequest) {
  const auth = getServerAuth();
  const token = getBearerToken(request);

  if (!auth || !token) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    return { decodedToken };
  } catch {
    return { error: NextResponse.json({ error: 'invalid_token' }, { status: 401 }) };
  }
}

async function createTeacherProfileIfNeeded(uid: string, role: AuthRole) {
  if (role !== 'teacher') return;

  const db = getServerDb();
  if (!db) throw new Error('Firestore not initialized');

  const teacherRef = db.collection(COLLECTIONS.TEACHERS).doc(uid);
  const teacherDoc = await teacherRef.get();
  if (teacherDoc.exists) return;

  await teacherRef.set({
    uid,
    experienceYears: 0,
    teachingStyle: [],
    rating: 0,
    totalReviews: 0,
    totalStudents: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function GET(request: NextRequest) {
  const verified = await verifyRequest(request);
  if ('error' in verified) return verified.error;

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(verified.decodedToken.uid).get();
  if (!userDoc.exists) return NextResponse.json({ user: null }, { status: 404 });

  return NextResponse.json({ user: { uid: userDoc.id, ...userDoc.data() } });
}

export async function POST(request: NextRequest) {
  const verified = await verifyRequest(request);
  if ('error' in verified) return verified.error;

  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const requestedRole = toAuthRole(body.role);
  const uid = verified.decodedToken.uid;
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    const user = { uid: userDoc.id, ...userDoc.data() };
    return NextResponse.json({ user, created: false });
  }

  const email = verified.decodedToken.email || '';
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim()
      : verified.decodedToken.name || email || 'User';
  const photoURL =
    typeof body.photoURL === 'string' && body.photoURL.trim()
      ? body.photoURL.trim()
      : verified.decodedToken.picture || undefined;

  const newProfile = {
    uid,
    email,
    displayName,
    role: requestedRole,
    isVerified: Boolean(verified.decodedToken.email_verified),
    verificationLevel: verified.decodedToken.email_verified ? 'basic' : 'none',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(photoURL ? { photoURL } : {}),
  };

  await userRef.set(newProfile);
  await createTeacherProfileIfNeeded(uid, requestedRole);

  const createdDoc = await userRef.get();
  return NextResponse.json({
    user: { uid: createdDoc.id, ...createdDoc.data() },
    created: true,
  });
}
