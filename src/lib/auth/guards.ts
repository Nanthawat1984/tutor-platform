import { redirect } from 'next/navigation';
import { getServerDb } from '@/lib/firebase/server';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser, type SessionUser } from './session';
import { getRoleHomePath } from './role-routes';

type AppRole = SessionUser['role'];

export async function requireRole(allowed: AppRole[]) {
  const session = await requireSessionUser();
  const db = getServerDb();
  if (!db) redirect('/login');

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const role = userSnap.exists ? (userSnap.data()?.role as AppRole | undefined) : undefined;
  if (!role || !allowed.includes(role)) {
    redirect(getRoleHomePath(role));
  }

  return { session, db, role };
}

export async function requireAdmin() {
  return requireRole(['admin']);
}
