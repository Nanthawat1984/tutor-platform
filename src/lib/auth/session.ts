// Server-side session helpers
// Reads session cookie set by /api/auth/session and decodes it

import { cookies } from 'next/headers';
import { getServerAuth } from '@/lib/firebase/server';

const SESSION_COOKIE_NAME = 'fb_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'teacher' | 'parent' | 'admin';
  photoURL?: string;
}

/**
 * Read the session cookie and decode the user.
 * Returns null if no valid session exists.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    // The cookie contains a Firebase ID token — verify it
    const auth = getServerAuth();
    if (!auth) return null;

    const decoded = await auth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      displayName: decoded.name || decoded.email || '',
      role: (decoded as any).role || 'parent',
      photoURL: decoded.picture || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get the session user, redirect to /login if not authenticated.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
    // redirect() throws — this line is never reached
    throw new Error('unreachable');
  }
  return user;
}

/**
 * Get the session user UID, redirect to /login if not authenticated.
 */
export async function requireUserId(): Promise<string> {
  const user = await requireSessionUser();
  return user.uid;
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE };
