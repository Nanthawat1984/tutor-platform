import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { requireSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin section guard.
 *
 * Middleware only checks that a user is logged in (cookie present). This layout
 * additionally verifies — server-side, straight from Firestore (single source of
 * truth for role) — that the current user actually has role === 'admin'.
 * Non-admins are redirected to their own home page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionUser();
  const db = getServerDb();
  if (!db) return redirect('/login');

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const role = userDoc.exists ? (userDoc.data() as { role?: string } | undefined)?.role : undefined;

  if (role !== 'admin') {
    // Not an admin → send them to their own dashboard
    redirect(role === 'teacher' ? '/dashboard' : '/my-bookings');
  }

  return <>{children}</>;
}
