// Firebase Client-side React Hooks
// ใช้ใน client components (interactive UI)

'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
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
import { needsProfileSetup as computeNeedsProfileSetup, resolveProfileAction } from '@/lib/auth/profile-provisioning';
import type {
  User, TeacherProfile, Course, Booking, Attendance,
  SessionReport, Review, Notification, Payment, Center, Schedule
} from '@/types/firestore';
import { COLLECTIONS } from '@/types/firestore';
import type { RegistrationConsent } from '@/lib/legal/consent';

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

function getPendingGoogleConsent(): RegistrationConsent | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.sessionStorage.getItem('pendingGoogleConsent');
  window.sessionStorage.removeItem('pendingGoogleConsent');
  if (!raw) return undefined;
  try {
    const consent = JSON.parse(raw) as RegistrationConsent;
    return consent.termsVersion && consent.privacyVersion ? consent : undefined;
  } catch {
    return undefined;
  }
}

function setPendingGoogleConsent(consent?: RegistrationConsent) {
  if (typeof window === 'undefined') return;
  if (consent) {
    window.sessionStorage.setItem('pendingGoogleConsent', JSON.stringify(consent));
  } else {
    window.sessionStorage.removeItem('pendingGoogleConsent');
  }
}

/** โทเคนล่าสุดที่เขียนลงคุกกี้ __session — ใช้กัน POST ซ้ำตอน token เพิ่งถูกเซ็ต */
let lastSessionToken: string | null = null;

async function setSessionCookie(firebaseUser: FirebaseUser) {
  try {
    const idToken = await firebaseUser.getIdToken();
    lastSessionToken = idToken;
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
  lastSessionToken = null;
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

async function ensureUserProfile(firebaseUser: FirebaseUser, role: AuthRole = 'parent', consent?: RegistrationConsent) {
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
      ...(consent ? { consent } : {}),
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'profile-create-failed');
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
  /** ล็อกอินผ่าน Firebase แล้วแต่ยังไม่มีโปรไฟล์ใน Firestore — ต้องให้ผู้ใช้กรอกบทบาท + ยอมรับข้อตกลงก่อน */
  needsProfileSetup: boolean;
  signIn: (email: string, password: string) => Promise<User | null>;
  signUp: (email: string, password: string, fullName: string, role: AuthRole, consent: RegistrationConsent) => Promise<void>;
  signInWithGoogle: (role?: AuthRole, consent?: RegistrationConsent) => Promise<User | null>;
  signInWithGoogleRedirect: (role?: AuthRole, consent?: RegistrationConsent) => Promise<void>;
  completeProfileSetup: (role: AuthRole, consent: RegistrationConsent) => Promise<User>;
  sendPasswordReset: (email: string) => Promise<void>;
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

    // อ่านค่าค้างจาก Google redirect ครั้งเดียว — getRedirectResult กับ
    // onAuthStateChanged รันพร้อมกัน ถ้าเรียก getPendingGoogle* สองครั้ง ครั้งที่สอง
    // จะได้ค่า default แล้วทำให้ consent ที่ผู้ใช้เพิ่งยอมรับหายไป
    const pendingRole = getPendingGoogleRole();
    const pendingConsent = getPendingGoogleConsent();

    /**
     * โหลดโปรไฟล์เดิมก่อนเสมอ ถ้าไม่มีค่อยคิดว่าจะสร้างใหม่ได้หรือไม่
     * ห้ามสร้างโดยไม่มี consent — เซิร์ฟเวอร์จะตอบ 400 consent_required
     * แล้วผู้ใช้จะไม่มีโปรไฟล์ให้ใช้งานระบบเลย
     */
    async function loadOrCreateProfile(firebaseUser: FirebaseUser) {
      const existingProfile = await fetchUserProfile(firebaseUser);
      const action = resolveProfileAction({
        existingProfile,
        hasConsent: Boolean(pendingConsent),
      });
      if (action === 'reuse') return existingProfile;
      if (action === 'create') return ensureUserProfile(firebaseUser, pendingRole, pendingConsent);
      return null;
    }

    void getRedirectResult(auth).then(async (result) => {
      if (!result?.user || !isMounted) return;
      // Set the session cookie BEFORE exposing the profile so that any
      // navigation triggered by setUserProfile has the cookie ready.
      // (Fixes bounce-back to /login after Google redirect sign-in.)
      await setSessionCookie(result.user);
      const profile = await loadOrCreateProfile(result.user);
      if (isMounted) setUserProfile(profile);
    }).catch((error) => {
      console.error('Google redirect sign-in error:', error);
    });

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      try {
        if (firebaseUser) {
          // Always set the session cookie FIRST so the middleware lets the
          // user through even if profile creation/read fails below.
          await setSessionCookie(firebaseUser);
          const profile = await loadOrCreateProfile(firebaseUser);
          if (profile) {
            setUserProfile(profile);
          }
        } else {
          setUserProfile(null);
          await clearSessionCookie();
        }
      } catch (error) {
        console.error('Auth profile load error:', error);
        // อย่า setUserProfile(null) — อาจไปทับ profile ที่ signInWithGoogle
        // ตั้งไว้แล้ว ทำให้หน้า login ค้าง (userProfile เป็น null → ไม่ redirect ต่อ)
      } finally {
        setLoading(false);
      }
    });

    // คุกกี้ __session เก็บ Firebase ID token ที่อายุ ~1 ชม. แต่ตัวคุกกี้เองมี
    // maxAge 7 วัน — ถ้าไม้ดันคุกกี้ใหม่ตอน Firebase refresh token ฝั่ง client
    // verifyIdToken() ฝั่ง server จะ fail เมื่อครบ 1 ชม. แล้วทุกหน้าที่ล็อกอินไว้
    // (รวมถึงหน้าแอดมิน) จะถูกดีดกลับไป /login โดยไม่มีสาเหตุที่ผู้ใช้เห็น
    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;
      const idToken = await firebaseUser.getIdToken().catch(() => null);
      if (!idToken || idToken === lastSessionToken) return;
      await setSessionCookie(firebaseUser);
    });

    return () => {
      isMounted = false;
      unsub();
      unsubToken();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // ตั้งคุกกี้ก่อนเสมอ เพื่อให้ middleware ไม่ดีดกลับ /login แม้โปรไฟล์จะยังไม่มี
    await setSessionCookie(cred.user);
    const profile = await fetchUserProfile(cred.user);
    setUserProfile(profile);
    // profile = null → บัญชีนี้ยังไม่มีเอกสารใน Firestore ผู้ใช้ต้องกรอกบทบาท
    // และยอมรับข้อตกลงก่อน (needsProfileSetup) ห้ามสร้างให้อัตโนมัติ
    return profile;
  }, []);

  /**
   * สร้างโปรไฟล์ให้ผู้ใช้ที่ล็อกอินผ่าน Firebase แล้วแต่ยังไม่มีเอกสารใน Firestore
   * เรียกหลังผู้ใช้เลือกบทบาทและยอมรับข้อตกลงผู้ใช้บริการแล้วเท่านั้น
   */
  const completeProfileSetup = useCallback(async (role: AuthRole, consent: RegistrationConsent) => {
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser) throw new Error('not_signed_in');

    const profile = await ensureUserProfile(firebaseUser, role, consent);
    setUserProfile(profile);
    await setSessionCookie(firebaseUser);
    return profile;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: AuthRole, consent: RegistrationConsent) => {
    const auth = getFirebaseAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Update Firebase Auth profile
    await firebaseUpdateProfile(cred.user, { displayName: fullName });
    const profile = await ensureUserProfile(cred.user, role, consent);
    await setSessionCookie(cred.user);
    setUserProfile(profile);

    // Send email verification
    await sendEmailVerification(cred.user);
  }, []);

  const signInWithGoogle = useCallback(async (role: AuthRole = 'parent', consent?: RegistrationConsent) => {
    const auth = getFirebaseAuth();
    setPendingGoogleRole(role);
    setPendingGoogleConsent(consent);

    // signInWithPopup จะ reject เองเมื่อ popup ถูกบล็อก (auth/popup-blocked)
    // หรือผู้ใช้ปิดหน้าต่าง (auth/popup-closed-by-user) — ไม่ต้องมี timeout
    // เพราะ timeout เดิม (25 วิ) ทำให้ผู้ใช้ที่ใช้เวลาเลือกบัญชี Google นาน
    // fallback ไป signInWithRedirect ซึ่ง route __/auth/handler ไม่มี → ระบบค้าง
    try {
      const result = await signInWithPopup(auth, createGoogleProvider());
      // Set the session cookie BEFORE exposing the profile so any navigation
      // triggered by setUserProfile has the cookie ready.
      await setSessionCookie(result.user);

      const existingProfile = await fetchUserProfile(result.user);
      const action = resolveProfileAction({ existingProfile, hasConsent: Boolean(consent) });
      // หน้า login ไม่ได้ส่ง consent มา (ผู้ใช้กลับมาใช้บัญชีเดิม) → คืน null
      // ให้ UI พาไปขั้นตอนกรอกโปรไฟล์ แทนที่จะยิง create แล้วโดนปฏิเสธ
      if (action === 'reuse') {
        setUserProfile(existingProfile);
        return existingProfile;
      }
      if (action === 'create') {
        const profile = await ensureUserProfile(result.user, role, consent);
        setUserProfile(profile);
        return profile;
      }
      return null;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  }, []);

  const signInWithGoogleRedirect = useCallback(async (role: AuthRole = 'parent', consent?: RegistrationConsent) => {
    const auth = getFirebaseAuth();
    setPendingGoogleRole(role);
    setPendingGoogleConsent(consent);
    await signInWithRedirect(auth, createGoogleProvider());
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    setUserProfile(null);
    await clearSessionCookie();
  }, []);

  // ล็อกอินผ่าน Firebase ได้แต่ไม่มีเอกสารผู้ใช้ = ยังใช้งานระบบไม่ได้
  // ต้องให้ผู้ใช้กรอกบทบาท + ยอมรับข้อตกลงก่อน
  const needsProfileSetup = computeNeedsProfileSetup({
    signedIn: Boolean(user),
    loading,
    profile: userProfile,
  });

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, needsProfileSetup, signIn, signUp, signInWithGoogle, signInWithGoogleRedirect, completeProfileSetup, sendPasswordReset, logout }}>
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
