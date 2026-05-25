// Firestore Data Model — TutorPlatform
//
// Firestore = NoSQL document store ไม่มี JOIN, ไม่มี RLS
// ดังนั้นต้อง denormalize + เขียน security rules แทน
//
// Collection structure (hierarchical):
//
// users/{userId}
//   └── role: 'teacher' | 'parent' | 'admin'
//   └── profile data
//
// teachers/{teacherId}
//   └── profile + stats (rating, totalReviews, totalStudents)
//
// centers/{centerId}
//   └── teacherId (owner)
//
// subjects/{subjectId}  — static/reference data
//
// courses/{courseId}
//   └── teacherId, centerId, subjectId (denormalized names)
//
// bookings/{bookingId}
//   └── courseId, teacherId, parentId
//   └── denormalized: courseTitle, teacherName, parentName, studentName
//
// attendance/{attendanceId}
//   └── bookingId, courseId, teacherId
//   └── denormalized: studentName, sessionDate
//
// sessionReports/{reportId}
//   └── bookingId, courseId, teacherId, parentId
//   └── denormalized: studentName, courseTitle, sessionDate
//
// reviews/{reviewId}
//   └── bookingId, teacherId, parentId
//   └── denormalized: teacherName, parentName, rating
//
// notifications/{notificationId}
//   └── userId (owner)
//
// payments/{paymentId}
//   └── bookingId, parentId
//   └── denormalized: amount, method, status

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =============================================
// USER
// =============================================
export interface User {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string;
  role: 'teacher' | 'parent' | 'admin';
  isVerified: boolean;
  verificationLevel: 'none' | 'basic' | 'full';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// TEACHER PROFILE
// =============================================
export interface TeacherProfile {
  uid: string;
  bio?: string;
  education?: string;
  experienceYears: number;
  teachingStyle: string[];  // ['fun', 'exam_focused', 'concept_based']
  videoIntroURL?: string;
  rating: number;           // computed average
  totalReviews: number;     // computed count
  totalStudents: number;    // computed count
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// CENTER (สถานที่สอน)
// =============================================
export interface Center {
  id: string;
  teacherId: string;
  name: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  isOnline: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// SUBJECT (วิชา — reference data)
// =============================================
export interface Subject {
  id: string;
  name: string;
  nameEn?: string;
  category: 'math' | 'science' | 'language' | 'social' | 'test_prep' | 'other';
  sortOrder: number;
  isActive: boolean;
}

// =============================================
// COURSE
// =============================================
export interface Course {
  id: string;
  teacherId: string;
  teacherName: string;       // denormalized
  centerId?: string;
  centerName?: string;       // denormalized
  subjectId: string;
  subjectName: string;       // denormalized
  title: string;
  description?: string;
  level: string;             // 'ป.1' ... 'ม.6', 'TGAT', 'A-Level'
  format: 'one_on_one' | 'small_group' | 'online' | 'hybrid';
  maxStudents: number;
  pricePerSession: number;
  priceCurrency: string;
  durationMinutes: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// SCHEDULE
// =============================================
export interface Schedule {
  id: string;
  courseId: string;
  courseTitle: string;       // denormalized
  dayOfWeek: number;         // 0=Sunday
  startTime: string;         // "16:30"
  endTime: string;           // "18:00"
  startDate: string;         // "2025-06-01"
  endDate?: string;
  isRecurring: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// BOOKING
// =============================================
export interface Booking {
  id: string;
  courseId: string;
  courseTitle: string;       // denormalized
  teacherId: string;
  teacherName: string;       // denormalized
  parentId: string;
  parentName: string;        // denormalized
  studentName: string;
  studentLevel?: string;
  bookingDate: string;       // "2025-06-15"
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  totalPrice: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// ATTENDANCE
// =============================================
export interface Attendance {
  id: string;
  bookingId: string;
  courseId: string;
  teacherId: string;
  studentName: string;       // denormalized
  sessionDate: string;       // "2025-06-15"
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending';
  checkInTime?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// SESSION REPORT
// =============================================
export interface SessionReport {
  id: string;
  bookingId: string;
  courseId: string;
  courseTitle: string;       // denormalized
  teacherId: string;
  parentId: string;
  studentName: string;       // denormalized
  sessionDate: string;
  topicsCovered?: string;
  homework?: string;
  score?: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// REVIEW
// =============================================
export interface Review {
  id: string;
  bookingId: string;
  teacherId: string;
  teacherName: string;       // denormalized
  parentId: string;
  parentName: string;        // denormalized
  rating: number;            // 1-5
  comment?: string;
  isVerified: boolean;
  isVisible: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// NOTIFICATION
// =============================================
export interface Notification {
  id: string;
  userId: string;
  type: 'booking' | 'payment' | 'attendance' | 'report' | 'review' | 'system';
  title: string;
  body: string;
  data: Record<string, any>;
  isRead: boolean;
  createdAt: Timestamp;
}

// =============================================
// PAYMENT
// =============================================
export interface Payment {
  id: string;
  bookingId: string;
  parentId: string;
  amount: number;
  currency: string;
  method: 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  transactionId?: string;
  paidAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// Firestore collection paths (constants)
// =============================================
export const COLLECTIONS = {
  USERS: 'users',
  TEACHERS: 'teachers',
  CENTERS: 'centers',
  SUBJECTS: 'subjects',
  COURSES: 'courses',
  SCHEDULES: 'schedules',
  BOOKINGS: 'bookings',
  ATTENDANCE: 'attendance',
  SESSION_REPORTS: 'sessionReports',
  REVIEWS: 'reviews',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
} as const;
