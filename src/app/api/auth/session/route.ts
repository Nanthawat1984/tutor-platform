import { NextRequest, NextResponse } from 'next/server';
import { getServerAuth } from '@/lib/firebase/server';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth/session';

/**
 * POST /api/auth/session
 * Body: { idToken: string }
 * Verifies the Firebase ID token and sets an HTTP-only session cookie.
 */
export async function POST(request: NextRequest) {
  const auth = getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const idToken = body.idToken as string | undefined;

  if (!idToken) {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  try {
    const decoded = await auth.verifyIdToken(idToken);

    // Look up user role from Firestore
    const { getServerDb } = await import('@/lib/firebase/server');
    const db = getServerDb();
    let role = 'parent';
    if (db) {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        role = (userDoc.data() as any)?.role || 'parent';
      }
    }

    // Create a custom token claims object to embed in the cookie
    // We store a compact JWT-like payload: uid|role
    const sessionPayload = JSON.stringify({
      uid: decoded.uid,
      role,
    });

    const response = NextResponse.json({ ok: true, role });

    // Set HTTP-only cookie with the Firebase ID token (short-lived, verified server-side)
    response.cookies.set(SESSION_COOKIE_NAME, idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie (logout).
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
