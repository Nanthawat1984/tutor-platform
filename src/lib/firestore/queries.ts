// Firestore query/mutation helpers
// ใช้ใน server actions และ API routes (server-side only)

import { getServerDb } from '../firebase/server';
import { COLLECTIONS } from '../../types/firestore';
import type { User, TeacherProfile, Course, Booking, Attendance, SessionReport, Review, Notification, Payment, Subject, Student } from '../../types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const serverTimestamp = () => FieldValue.serverTimestamp();

function db() {
  const firestore = getServerDb();
  if (!firestore) throw new Error('Firestore not initialized');
  return firestore;
}

// =============================================
// HELPERS
// =============================================
function col(name: string) {
  return db().collection(name);
}

function docRef(collection: string, id: string) {
  return col(collection).doc(id);
}

// =============================================
// USERS
// =============================================
export async function createUser(uid: string, data: Partial<User>) {
  await docRef(COLLECTIONS.USERS, uid).set({
    ...data,
    isVerified: false,
    verificationLevel: 'none',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
}

export async function getUser(uid: string): Promise<User | null> {
  const snap = await docRef(COLLECTIONS.USERS, uid).get();
  if (!snap.exists) return null;
  return { uid: snap.id, ...snap.data() } as User;
}

export async function getUserRole(uid: string): Promise<string | null> {
  const user = await getUser(uid);
  return user?.role || null;
}

export async function updateUser(uid: string, data: Partial<User>) {
  await docRef(COLLECTIONS.USERS, uid).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// TEACHERS
// =============================================
export async function createTeacherProfile(uid: string, data: Partial<TeacherProfile>) {
  await docRef(COLLECTIONS.TEACHERS, uid).set({
    uid,
    experienceYears: 0,
    teachingStyle: [],
    rating: 0,
    totalReviews: 0,
    totalStudents: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...data,
  } as any);
}

export async function getTeacherProfile(uid: string): Promise<TeacherProfile | null> {
  const snap = await docRef(COLLECTIONS.TEACHERS, uid).get();
  if (!snap.exists) return null;
  return { uid: snap.id, ...snap.data() } as TeacherProfile;
}

export async function updateTeacherProfile(uid: string, data: Partial<TeacherProfile>) {
  await docRef(COLLECTIONS.TEACHERS, uid).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeacherRating(teacherId: string) {
  const reviewsSnap = await col(COLLECTIONS.REVIEWS)
    .where('teacherId', '==', teacherId)
    .where('isVisible', '==', true)
    .get();

  if (reviewsSnap.empty) return;

  const ratings = reviewsSnap.docs.map((d) => (d.data() as Review).rating);
  const avg = Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10;

  await docRef(COLLECTIONS.TEACHERS, teacherId).update({
    rating: avg,
    totalReviews: ratings.length,
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// SUBJECTS
// =============================================
export async function seedSubjects() {
  const subjects: Omit<Subject, 'id'>[] = [
    { name: 'คณิตศาสตร์', nameEn: 'Mathematics', category: 'math', sortOrder: 1, isActive: true },
    { name: 'วิทยาศาสตร์', nameEn: 'Science', category: 'science', sortOrder: 2, isActive: true },
    { name: 'ภาษาอังกฤษ', nameEn: 'English', category: 'language', sortOrder: 3, isActive: true },
    { name: 'ภาษาไทย', nameEn: 'Thai', category: 'language', sortOrder: 4, isActive: true },
    { name: 'สังคมศึกษา', nameEn: 'Social Studies', category: 'social', sortOrder: 5, isActive: true },
    { name: 'ฟิสิกส์', nameEn: 'Physics', category: 'science', sortOrder: 6, isActive: true },
    { name: 'เคมี', nameEn: 'Chemistry', category: 'science', sortOrder: 7, isActive: true },
    { name: 'ชีววิทยา', nameEn: 'Biology', category: 'science', sortOrder: 8, isActive: true },
    { name: 'คอมพิวเตอร์', nameEn: 'Computer Science', category: 'other', sortOrder: 9, isActive: true },
    { name: 'TGAT', nameEn: 'TGAT', category: 'test_prep', sortOrder: 10, isActive: true },
    { name: 'A-Level', nameEn: 'A-Level', category: 'test_prep', sortOrder: 11, isActive: true },
    { name: 'O-NET', nameEn: 'O-NET', category: 'test_prep', sortOrder: 12, isActive: true },
    { name: 'สอบเข้า ม.ปลาย', nameEn: 'High School Entrance', category: 'test_prep', sortOrder: 13, isActive: true },
    { name: 'ปรับพื้นฐาน', nameEn: 'Remedial', category: 'other', sortOrder: 14, isActive: true },
    { name: 'อื่นๆ', nameEn: 'Other', category: 'other', sortOrder: 99, isActive: true },
  ];

  const batch = db().batch();
  const subjectsCol = db().collection(COLLECTIONS.SUBJECTS);

  for (const s of subjects) {
    const ref = subjectsCol.doc();
    batch.set(ref, s);
  }

  await batch.commit();
  console.log(`✅ Seeded ${subjects.length} subjects`);
}

export async function getSubjects(): Promise<Subject[]> {
  const snap = await db().collection(COLLECTIONS.SUBJECTS)
    .where('isActive', '==', true)
    .orderBy('sortOrder')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject));
}

// =============================================
// COURSES
// =============================================
export async function getCourses(filters?: {
  subjectId?: string;
  level?: string;
  teacherId?: string;
  isActive?: boolean;
  limitCount?: number;
}): Promise<Course[]> {
  let q: FirebaseFirestore.Query = db().collection(COLLECTIONS.COURSES).orderBy('createdAt', 'desc');

  if (filters?.subjectId) q = q.where('subjectId', '==', filters.subjectId);
  if (filters?.level) q = q.where('level', '==', filters.level);
  if (filters?.teacherId) q = q.where('teacherId', '==', filters.teacherId);
  if (filters?.isActive !== undefined) q = q.where('isActive', '==', filters.isActive);
  if (filters?.limitCount) q = q.limit(filters.limitCount);

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function getCourseById(id: string): Promise<Course | null> {
  const snap = await docRef(COLLECTIONS.COURSES, id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Course;
}

export async function createCourse(data: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await db().collection(COLLECTIONS.COURSES).add({
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function updateCourse(id: string, data: Partial<Course>) {
  await docRef(COLLECTIONS.COURSES, id).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCourse(id: string) {
  await docRef(COLLECTIONS.COURSES, id).update({
    isActive: false,
    updatedAt: serverTimestamp(),
  });
}

// =============================================
// BOOKINGS
// =============================================
export async function getBookingsByParent(parentId: string): Promise<Booking[]> {
  const snap = await db().collection(COLLECTIONS.BOOKINGS)
    .where('parentId', '==', parentId)
    .orderBy('bookingDate', 'desc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

export async function getBookingsByTeacher(teacherId: string, date?: string): Promise<Booking[]> {
  let q: FirebaseFirestore.Query = db().collection(COLLECTIONS.BOOKINGS)
    .where('teacherId', '==', teacherId)
    .orderBy('bookingDate', 'asc')
    .orderBy('startTime', 'asc');

  if (date) q = q.where('bookingDate', '==', date);

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

export async function createBooking(data: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await db().collection(COLLECTIONS.BOOKINGS).add({
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function updateBookingStatus(id: string, status: Booking['status']) {
  await docRef(COLLECTIONS.BOOKINGS, id).update({
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelBooking(id: string) {
  await updateBookingStatus(id, 'cancelled');
  const paymentsSnap = await db().collection(COLLECTIONS.PAYMENTS)
    .where('bookingId', '==', id)
    .where('status', '==', 'pending')
    .get();

  const batch = db().batch();
  paymentsSnap.docs.forEach((d) => batch.update(d.ref, { status: 'failed' }));
  await batch.commit();
}

// =============================================
// ATTENDANCE
// =============================================
export async function markAttendance(data: Omit<Attendance, 'id' | 'createdAt' | 'updatedAt'>) {
  const existing = await db().collection(COLLECTIONS.ATTENDANCE)
    .where('bookingId', '==', data.bookingId)
    .where('sessionDate', '==', data.sessionDate)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({
      ...data,
      checkInTime: data.status === 'present' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    return existing.docs[0].id;
  }

  const ref = await db().collection(COLLECTIONS.ATTENDANCE).add({
    ...data,
    checkInTime: data.status === 'present' ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function getAttendanceByTeacher(teacherId: string, date: string): Promise<Attendance[]> {
  const snap = await db().collection(COLLECTIONS.ATTENDANCE)
    .where('teacherId', '==', teacherId)
    .where('sessionDate', '==', date)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Attendance));
}

// =============================================
// SESSION REPORTS
// =============================================
export async function createSessionReport(data: Omit<SessionReport, 'id' | 'createdAt' | 'updatedAt'>) {
  const existing = await db().collection(COLLECTIONS.SESSION_REPORTS)
    .where('bookingId', '==', data.bookingId)
    .where('sessionDate', '==', data.sessionDate)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({ ...data, updatedAt: serverTimestamp() });
    return existing.docs[0].id;
  }

  const ref = await db().collection(COLLECTIONS.SESSION_REPORTS).add({
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function getSessionReportsByParent(parentId: string): Promise<SessionReport[]> {
  const snap = await db().collection(COLLECTIONS.SESSION_REPORTS)
    .where('parentId', '==', parentId)
    .orderBy('sessionDate', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionReport));
}

// =============================================
// REVIEWS
// =============================================
export async function createReview(data: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await db().collection(COLLECTIONS.REVIEWS).add({
    ...data,
    isVerified: true,
    isVisible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);

  await updateTeacherRating(data.teacherId);
  return ref.id;
}

export async function getReviewsByTeacher(teacherId: string): Promise<Review[]> {
  const snap = await db().collection(COLLECTIONS.REVIEWS)
    .where('teacherId', '==', teacherId)
    .where('isVisible', '==', true)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
}

// =============================================
// STUDENTS
// =============================================
export async function getStudentsByParent(parentId: string): Promise<Student[]> {
  const snap = await db().collection(COLLECTIONS.STUDENTS)
    .where('parentId', '==', parentId)
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
}

export async function createStudent(data: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await db().collection(COLLECTIONS.STUDENTS).add({
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function updateStudent(id: string, data: Partial<Student>) {
  await docRef(COLLECTIONS.STUDENTS, id).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStudent(id: string) {
  await docRef(COLLECTIONS.STUDENTS, id).delete();
}

// =============================================
// NOTIFICATIONS
// =============================================
export async function createNotification(data: Omit<Notification, 'id' | 'createdAt'>) {
  const ref = await db().collection(COLLECTIONS.NOTIFICATIONS).add({
    ...data,
    isRead: false,
    createdAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function getNotificationsByUser(userId: string): Promise<Notification[]> {
  const snap = await db().collection(COLLECTIONS.NOTIFICATIONS)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
}

export async function markNotificationRead(id: string) {
  await docRef(COLLECTIONS.NOTIFICATIONS, id).update({ isRead: true });
}

export async function markAllNotificationsRead(userId: string) {
  const snap = await db().collection(COLLECTIONS.NOTIFICATIONS)
    .where('userId', '==', userId)
    .where('isRead', '==', false)
    .get();

  const batch = db().batch();
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}

// =============================================
// PAYMENTS
// =============================================
export async function createPayment(data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await db().collection(COLLECTIONS.PAYMENTS).add({
    ...data,
    status: 'pending',
    escrowProcessed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function updatePaymentStatus(id: string, status: Payment['status'], transactionId?: string) {
  await docRef(COLLECTIONS.PAYMENTS, id).update({
    status,
    transactionId: transactionId || null,
    paidAt: status === 'paid' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function getPaymentsByParent(parentId: string): Promise<Payment[]> {
  const snap = await db().collection(COLLECTIONS.PAYMENTS)
    .where('parentId', '==', parentId)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}

export async function getPaymentsByTeacher(teacherId: string): Promise<Payment[]> {
  const snap = await db().collection(COLLECTIONS.PAYMENTS)
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}
