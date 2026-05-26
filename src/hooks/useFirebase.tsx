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

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

async function getOrCreateGoogleUserProfile(firebaseUser: FirebaseUser) {
  const db = getFirebaseDb();
  const userRef = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    return { uid: userDoc.id, ...userDoc.data() } as User;
  }

  const newProfile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || firebaseUser.email || 'Google User',
    role: 'parent',
    isVerified: true,
    verificationLevel: 'basic',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
  } as const;

  await setDoc(userRef, newProfile);
  return newProfile as unknown as User;
}

// =============================================
// AUTH CONTEXT
// =============================================
interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User | null>;
  signUp: (email: string, password: string, fullName: string, role: 'teacher' | 'parent') => Promise<void>;
  signInWithGoogle: () => Promise<User>;
  signInWithGoogleRedirect: () => Promise<void>;
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
      const profile = await getOrCreateGoogleUserProfile(result.user);
      if (isMounted) setUserProfile(profile);
    }).catch((error) => {
      console.error('Google redirect sign-in error:', error);
    });

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch user profile from Firestore
        const db = getFirebaseDb();
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid));
        if (userDoc.exists()) {
          setUserProfile({ uid: userDoc.id, ...userDoc.data() } as User);
        } else if (isGoogleProviderUser(firebaseUser.providerData)) {
          const profile = await getOrCreateGoogleUserProfile(firebaseUser);
          setUserProfile(profile);
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, cred.user.uid));
    if (!userDoc.exists()) return null;
    const profile = { uid: userDoc.id, ...userDoc.data() } as User;
    setUserProfile(profile);
    return profile;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: 'teacher' | 'parent') => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Create user document
    await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName: fullName,
      role,
      isVerified: false,
      verificationLevel: 'none',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update Firebase Auth profile
    await firebaseUpdateProfile(cred.user, { displayName: fullName });

    // Send email verification
    await sendEmailVerification(cred.user);

    // Create teacher profile if teacher
    if (role === 'teacher') {
      await setDoc(doc(db, COLLECTIONS.TEACHERS, cred.user.uid), {
        uid: cred.user.uid,
        experienceYears: 0,
        teachingStyle: [],
        rating: 0,
        totalReviews: 0,
        totalStudents: 0,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const result = await signInWithPopup(auth, createGoogleProvider());
    const profile = await getOrCreateGoogleUserProfile(result.user);
    setUserProfile(profile);
    return profile;
  }, []);

  const signInWithGoogleRedirect = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signInWithRedirect(auth, createGoogleProvider());
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    setUserProfile(null);
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
