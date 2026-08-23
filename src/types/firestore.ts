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
  address?: string;             // ที่อยู่ผู้ปกครอง — ข้อมูลส่วนตัว
  photoURL?: string;
  idCardPath?: string;          // path บัตรประชาชนผู้ปกครองใน private Storage
  role: 'teacher' | 'parent' | 'admin';
  isVerified: boolean;
  verificationLevel: 'none' | 'basic' | 'full';
  // ── KYC + บัญชีรับเงิน (ครู) ──
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  kycNote?: string;            // เหตุผลจากแอดมิน (กรณี rejected)
  kycSubmittedAt?: Timestamp;
  payoutBankName?: string;     // ธนาคาร
  payoutAccountName?: string;  // ชื่อบัญชี (ต้องตรงกับบัตร)
  payoutAccountNumber?: string;// เลขบัญชี
  bookBankURL?: string;        // สำเนาสมุดบัญชี (Storage URL)
  idCardURL?: string;          // สำเนาบัตรประชาชน (Storage URL)
  termsVersion?: string;       // ฉบับข้อตกลงที่ผู้ใช้ยอมรับ
  privacyVersion?: string;     // ฉบับนโยบายความเป็นส่วนตัวที่ผู้ใช้รับทราบ
  consentAcceptedAt?: Timestamp;
  lineUserId?: string;         // LINE user ID ที่ผ่าน LIFF verification แล้ว
  lineLinkedAt?: Timestamp;
  lineNotificationEnabled?: boolean;
  // ── Stripe Connect (ครู) ──
  stripeConnectAccountId?: string;
  stripeConnectStatus?: string;
  stripeConnectTransfersStatus?: string | null;
  stripeConnectPayoutsStatus?: string | null;
  stripeConnectUpdatedAt?: Timestamp;
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
  studentId?: string;        // อ้างอิง students/{id} (ถ้าจองด้วยรายชื่อที่บันทึก)
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
// STUDENT (ลูกของแต่ละผู้ปกครอง)
// =============================================
export interface Student {
  id: string;
  parentId: string;
  name: string;
  level?: string;          // 'ป.4', 'ม.2' ...
  school?: string;
  notes?: string;
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
// PAYMENT (การชำระเงิน — escrow model)
// =============================================
// Flow:
//   1. ผู้ปกครองจอง → สร้าง payment status=pending (โดย Admin SDK ฝั่ง server)
//   2. ผู้ปกครองเลือกวิธีชำระ (stripe_checkout / bank_transfer)
//   3. Gateway สำเร็จ → status=paid → ระบบ escrow: ยืนยันการจอง + เข้า wallet pending ของครู
//   4. เรียนเสร็จ (booking completed) → ปล่อย escrow pending → available ของครู
export type PaymentMethod = 'stripe_checkout' | 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'awaiting_review' | 'paid' | 'failed' | 'refunded' | 'cancelled';
// `omise` remains readable for historical records only; new payments use mock or Stripe.
export type PaymentProvider = 'mock' | 'omise' | 'stripe';

export interface Payment {
  id: string;
  bookingId: string;
  parentId: string;
  teacherId: string;        // denormalized — สำหรับ filter รายได้ครู
  studentName: string;      // denormalized
  courseTitle: string;      // denormalized
  amount: number;           // ยอดรวม (gross)
  fees: number;             // ค่าบริการแพลตฟอร์ม (เช่น 20%)
  netAmount: number;        // ยอดที่ครูจะได้รับ (amount - fees)
  currency: string;
  method: PaymentMethod;
  provider?: PaymentProvider;
  status: PaymentStatus;
  transactionId?: string;   // เลข transaction จาก gateway
  providerRef?: string;     // ref จาก gateway (เช่น Omise charge id)
  paidAt?: Timestamp;
  receiptNumber?: string;    // เลขที่ใบเสร็จที่ออกเมื่อชำระสำเร็จ
  receiptIssuedAt?: Timestamp;
  slipURL?: string;         // สำหรับวิธี bank_transfer (อัปโหลดสลิป)
  slipPath?: string;        // private Storage path สำหรับ Admin ตรวจสอบ
  submittedAt?: Timestamp;  // เวลาที่ผู้ปกครองส่งสลิปเข้าตรวจ
  reviewedBy?: string;      // Admin UID ผู้ตรวจสอบ
  reviewedAt?: Timestamp;
  reviewNote?: string;
  escrowProcessed?: boolean;// guard — กันประมวลผลซ้ำ (แอป process แล้ว trigger จะข้าม)
  expiresAt?: Timestamp;    // วันหมดอายุของ QR/รายการชำระ
  // ── ภาษีหัก ณ ที่จ่าย (3% ของ netAmount — หักตอน release escrow) ──
  taxWithheld?: number;     // ยอดภาษีที่หัก (บาท)
  payoutAmount?: number;    // ยอดสุทธิที่ครูได้รับจริง (netAmount - taxWithheld)
  taxWithheldAt?: Timestamp;// วันที่หัก (= วัน release escrow)
  stripeChargeId?: string;
  stripeTransferId?: string;
  stripeTransferStatus?: 'pending' | 'created' | 'failed' | 'locked';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// WALLET (กระเป๋าเงินครู — escrow)
// =============================================
export interface Wallet {
  id: string;               // = teacherId
  teacherId: string;
  pendingBalance: number;   // เงินรอปล่อย (escrow) — หลังชำระเงิน ยังไม่เรียนเสร็จ
  availableBalance: number; // เงินพร้อมโอน — ปล่อยเมื่อเรียนเสร็จ
  totalEarned: number;      // ยอดสะสมทั้งหมดที่เคยปล่อยแล้ว
  updatedAt: Timestamp;
}

// =============================================
// PAYOUT (การเบิกเงิน/โอนเงินให้ครู)
// =============================================
export interface Payout {
  id: string;
  teacherId: string;
  amount: number;
  status: 'requested' | 'processing' | 'paid' | 'rejected';
  bankName: string;
  accountName: string;
  accountNumber: string;
  note?: string;
  slipURL?: string;         // หลักฐานการโอนเงิน (อัปโหลดโดยแอดมิน)
  paidAt?: Timestamp;       // วันที่โอนจริง
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
  STUDENTS: 'students',
  REVIEWS: 'reviews',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  STRIPE_EVENTS: 'stripeWebhookEvents',
  WALLETS: 'wallets',
  PAYOUTS: 'payouts',
} as const;
