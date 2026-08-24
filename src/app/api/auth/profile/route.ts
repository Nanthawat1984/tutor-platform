import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAuth, getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { PRIVACY_VERSION, TERMS_VERSION, type RegistrationConsent } from '@/lib/legal/consent';
import { buildNewTeacherVerificationState } from '@/lib/auth/teacher-verification';

type AuthRole = 'parent' | 'teacher';

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function toAuthRole(value: unknown): AuthRole {
  return value === 'teacher' ? 'teacher' : 'parent';
}

function parseRegistrationConsent(value: unknown): RegistrationConsent | null {
  if (!value || typeof value !== 'object') return null;
  const consent = value as Record<string, unknown>;
  if (consent.termsVersion !== TERMS_VERSION || consent.privacyVersion !== PRIVACY_VERSION) return null;
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
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
  const consent = parseRegistrationConsent(body.consent);
  const uid = verified.decodedToken.uid;
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    if (consent) {
      await userRef.update({
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
        consentAcceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const latestUserDoc = consent ? await userRef.get() : userDoc;
    const user = { uid: latestUserDoc.id, ...latestUserDoc.data() };
    return NextResponse.json({ user, created: false });
  }

  if (!consent) {
    return NextResponse.json({ error: 'consent_required' }, { status: 400 });
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
  const emailVerified = Boolean(verified.decodedToken.email_verified);
  const teacherVerification = requestedRole === 'teacher'
    ? buildNewTeacherVerificationState(emailVerified)
    : null;

  const newProfile = {
    uid,
    email,
    displayName,
    role: requestedRole,
    emailVerified,
    isVerified: teacherVerification?.isVerified ?? emailVerified,
    verificationLevel: teacherVerification?.verificationLevel ?? (emailVerified ? 'basic' : 'none'),
    ...(teacherVerification ? { adminReviewStatus: teacherVerification.adminReviewStatus } : {}),
    termsVersion: consent.termsVersion,
    privacyVersion: consent.privacyVersion,
    consentAcceptedAt: FieldValue.serverTimestamp(),
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
