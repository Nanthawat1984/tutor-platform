// Firebase Client-side React Hooks
// ใช้ใน client components (interactive UI)

'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { connectEmulators, getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '@/lib/firebase/client';
import { isGoogleProviderUser } from '@/lib/auth/google';
import type {
  User, TeacherProfile, Course, Booking, Attendance,
  SessionReport, Review, Notification, Payment, Center, Schedule
} from '@/types/firestore';
import { COLLECTIONS } from '@/types/firestore';

// Re-export for convenience
export { getFirebaseStorage };

type AuthRole = 'teacher' | 'parent';

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function getPendingGoogleRole(): AuthRole {
  if (typeof window === 'undefined') return 'parent';
  const role = window.sessionStorage.getItem('pendingGoogleRole');
  window.sessionStorage.removeItem('pendingGoogleRole');
  return role === 'teacher' ? 'teacher' : 'parent';
}

function setPendingGoogleRole(role: AuthRole) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('pendingGoogleRole', role);
}

async function setSessionCookie(firebaseUser: FirebaseUser) {
  try {
    const idToken = await firebaseUser.getIdToken();
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch (error) {
    console.error('Failed to set session cookie:', error);
  }
}

async function clearSessionCookie() {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch {
    // ignore
  }
}

async function fetchUserProfile(firebaseUser: FirebaseUser) {
  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('profile-read-failed');

  const data = await response.json();
  return data.user as User | null;
}

async function ensureUserProfile(firebaseUser: FirebaseUser, role: AuthRole = 'parent') {
  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/auth/profile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role,
      displayName: firebaseUser.displayName || firebaseUser.email || undefined,
      photoURL: firebaseUser.photoURL || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error('profile-create-failed');
  }

  const data = await response.json();
  return data.user as User;
}

// =============================================
// AUTH CONTEXT
// =============================================
interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User | null>;
  signUp: (email: string, password: string, fullName: string, role: AuthRole) => Promise<void>;
  signInWithGoogle: (role?: AuthRole) => Promise<User>;
  signInWithGoogleRedirect: (role?: AuthRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    connectEmulators();

    const auth = getFirebaseAuth();
    let isMounted = true;

    void getRedirectResult(auth).then(async (result) => {
      if (!result?.user || !isMounted) return;
      const profile = await ensureUserProfile(result.user, getPendingGoogleRole());
      if (isMounted) setUserProfile(profile);
    }).catch((error) => {
      console.error('Google redirect sign-in error:', error);
    });

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      try {
        if (firebaseUser) {
          const profile = isGoogleProviderUser(firebaseUser.providerData)
            ? await ensureUserProfile(firebaseUser, getPendingGoogleRole())
            : await fetchUserProfile(firebaseUser);
          setUserProfile(profile);
          // Set session cookie for server-side auth
          await setSessionCookie(firebaseUser);
        } else {
          setUserProfile(null);
          await clearSessionCookie();
        }
      } catch (error) {
        console.error('Auth profile load error:', error);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchUserProfile(cred.user);
    setUserProfile(profile);
    await setSessionCookie(cred.user);
    return profile;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: AuthRole) => {
    const auth = getFirebaseAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Update Firebase Auth profile
    await firebaseUpdateProfile(cred.user, { displayName: fullName });
    await ensureUserProfile(cred.user, role);

    // Send email verification
    await sendEmailVerification(cred.user);
  }, []);

  const signInWithGoogle = useCallback(async (role: AuthRole = 'parent') => {
    const auth = getFirebaseAuth();
    setPendingGoogleRole(role);
    const result = await signInWithPopup(auth, createGoogleProvider());
    const profile = await ensureUserProfile(result.user, role);
    setUserProfile(profile);
    await setSessionCookie(result.user);
    return profile;
  }, []);

  const signInWithGoogleRedirect = useCallback(async (role: AuthRole = 'parent') => {
    const auth = getFirebaseAuth();
    setPendingGoogleRole(role);
    await signInWithRedirect(auth, createGoogleProvider());
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    setUserProfile(null);
    await clearSessionCookie();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signIn, signUp, signInWithGoogle, signInWithGoogleRedirect, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// =============================================
// REAL-TIME HOOKS
// =============================================

// Generic real-time collection hook
export function useCollection<T extends DocumentData>(
  collectionName: string,
  constraints: Array<{ field: string; op: string; value: any }> = [],
  limitCount?: number
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    let q: any = query(collection(db, collectionName));

    for (const c of constraints) {
      q = query(q, where(c.field, c.op as any, c.value));
    }

    if (limitCount) {
      q = query(q, limit(limitCount));
    }

    const unsub = onSnapshot(q, (snap: QuerySnapshot) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as T));
      setData(items);
      setLoading(false);
    }, (err: Error) => {
      setError(err);
      setLoading(false);
    });

    return unsub;
  }, [collectionName, JSON.stringify(constraints), limitCount]);

  return { data, loading, error };
}

// Real-time document hook
export function useDocument<T extends DocumentData>(collectionName: string, docId: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!docId) { setLoading(false); return; }

    const db = getFirebaseDb();
    const unsub = onSnapshot(doc(db, collectionName, docId), (snap) => {
      if (snap.exists()) {
        setData({ id: snap.id, ...snap.data() } as unknown as T);
      } else {
        setData(null);
      }
      setLoading(false);
    });

    return unsub;
  }, [collectionName, docId]);

  return { data, loading };
}

// =============================================
// NOTIFICATION HOOK (real-time)
// =============================================
export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const db = getFirebaseDb();
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as Notification));
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  const markRead = useCallback(async (notificationId: string) => {
    const db = getFirebaseDb();
    await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notificationId), { isRead: true });
  }, []);

  const markAllRead = useCallback(async () => {
    const db = getFirebaseDb();
    const batch = (await import('firebase/firestore')).writeBatch(db);
    notifications.filter((n) => !n.isRead).forEach((n) => {
      batch.update(doc(db, COLLECTIONS.NOTIFICATIONS, n.id), { isRead: true });
    });
    await batch.commit();
  }, [notifications]);

  return { notifications, unreadCount, loading, markRead, markAllRead };
}

// =============================================
// COURSES HOOK (with filters)
// =============================================
export function useCourses(filters?: { subjectId?: string; level?: string; limit?: number }) {
  const constraints: Array<{ field: string; op: string; value: any }> = [
    { field: 'isActive', op: '==', value: true },
  ];

  if (filters?.subjectId) constraints.push({ field: 'subjectId', op: '==', value: filters.subjectId });
  if (filters?.level) constraints.push({ field: 'level', op: '==', value: filters.level });

  return useCollection<Course>(COLLECTIONS.COURSES, constraints, filters?.limit);
}

// =============================================
// BOOKINGS HOOK (real-time)
// =============================================
export function useBookings(userId: string, role: 'parent' | 'teacher') {
  const field = role === 'parent' ? 'parentId' : 'teacherId';
  return useCollection<Booking>(COLLECTIONS.BOOKINGS, [{ field, op: '==', value: userId }]);
}

// =============================================
// ATTENDANCE HOOK (real-time, today only)
// =============================================
export function useAttendance(teacherId: string, date: string) {
  return useCollection<Attendance>(COLLECTIONS.ATTENDANCE, [
    { field: 'teacherId', op: '==', value: teacherId },
    { field: 'sessionDate', op: '==', value: date },
  ]);
}

// =============================================
// COURSE MUTATIONS
// =============================================
export async function createCourse(data: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  const ref = await addDoc(collection(db, COLLECTIONS.COURSES), {
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCourse(id: string, data: Partial<Course>) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.COURSES, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteCourse(id: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.COURSES, id), { isActive: false, updatedAt: serverTimestamp() });
}

// =============================================
// BOOKING MUTATIONS
// =============================================
export async function createBooking(data: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  const ref = await addDoc(collection(db, COLLECTIONS.BOOKINGS), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function cancelBooking(id: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.BOOKINGS, id), { status: 'cancelled', updatedAt: serverTimestamp() });
}

export async function confirmBooking(id: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.BOOKINGS, id), { status: 'confirmed', updatedAt: serverTimestamp() });
}

export async function completeBooking(id: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.BOOKINGS, id), { status: 'completed', updatedAt: serverTimestamp() });
}

// =============================================
// ATTENDANCE MUTATION
// =============================================
export async function markAttendance(data: Omit<Attendance, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
    ...data,
    checkInTime: data.status === 'present' ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// SESSION REPORT MUTATION
// =============================================
export async function createSessionReport(data: Omit<SessionReport, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  await addDoc(collection(db, COLLECTIONS.SESSION_REPORTS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// REVIEW MUTATION
// =============================================
export async function createReview(data: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  await addDoc(collection(db, COLLECTIONS.REVIEWS), {
    ...data,
    isVerified: true,
    isVisible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// PAYMENT MUTATION
// =============================================
export async function createPayment(data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  const ref = await addDoc(collection(db, COLLECTIONS.PAYMENTS), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// =============================================
// TEACHER PROFILE MUTATION
// =============================================
export async function updateTeacherProfile(uid: string, data: Partial<TeacherProfile>) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.TEACHERS, uid), { ...data, updatedAt: serverTimestamp() });
}

export async function createCenter(data: Omit<Center, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getFirebaseDb();
  const ref = await addDoc(collection(db, COLLECTIONS.CENTERS), {
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
