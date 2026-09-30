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
  emailVerified?: boolean;       // ยืนยันอีเมลจาก Firebase Auth (ไม่ใช่ Admin approval)
  adminReviewStatus?: 'pending' | 'approved' | 'rejected';
  adminReviewedAt?: Timestamp;
  adminReviewedBy?: string;
  adminReviewNote?: string;
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
  // ── คลาสทดลอง (เฟส 3) — ราคาพิเศษ ครั้งเดียวต่อผู้ปกครอง 1 คนต่อครู 1 คน ──
  trialEnabled?: boolean;
  trialPrice?: number;       // ราคาทดลอง (ใช้ duration เดียวกับคอร์สปกติ)
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
  startDate?: string;        // canonical: "2025-06-01"
  endDate?: string | null;
  // Legacy records created before the date-field naming was standardized.
  start_date?: string;
  end_date?: string | null;
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
  // ── คูปอง (เฟส 3) — ส่วนลดที่ผู้ปกครองใช้ตอนจอง ──
  couponCode?: string | null;
  couponDiscount?: number;
  // ── แพ็กเกจ/เครดิต (เฟส 1) ──
  packagePurchaseId?: string | null;
  paidWithCredit?: boolean;  // true = จองด้วยเครดิตแพ็กเกจ (ไม่สร้าง escrow ใหม่)
  creditReleased?: boolean;  // true = ปล่อย escrow รายครั้งให้ครูแล้ว
  // ── คลาสทดลอง (เฟส 3) ──
  isTrial?: boolean;
  // ── เลื่อน/ข้อพิพาท (เฟส 2) ──
  rescheduleCount?: number;
  lateReschedule?: boolean;
  dispute?: {
    status: 'open' | 'resolved';
    reason?: string;
    note?: string;
    createdAt?: Timestamp;
    resolvedAt?: Timestamp;
  } | null;
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
  photoPath?: string | null; // private Storage path; never a public download URL
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// NOTIFICATION
// =============================================
export interface Notification {
  id: string;
  userId: string;
  type: 'booking' | 'payment' | 'attendance' | 'report' | 'review' | 'system' | 'package';
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
  slipHash?: string | null; // sha256 ของไฟล์สลิป — กันส่งสลิปเดิมซ้ำหลายรายการ
  // ── auto-approve สลิป (เฟส 1คู่) ──
  autoApproved?: boolean;   // true = ระบบอนุมัติอัตโนมัติตามนโยบาย
  autoApproveReasons?: string[];
  agentStatus?: string | null;
  agentConfidence?: number | null;
  agentExtracted?: Record<string, any> | null;
  agentReasons?: string[];
  agentModel?: string | null;
  agentAnalyzedAt?: Timestamp;
  recipientLast4?: string | null;
  recipientMatchesCompany?: boolean | null;
  // ── แพ็กเกจ + คูปอง + วอลเล็ต (เฟส 1–3) ──
  kind?: 'session' | 'package'; // default 'session'
  packagePurchaseId?: string | null;
  couponCode?: string | null;
  couponId?: string | null;
  discountAmount?: number;  // ส่วนลดคูปอง (บาท)
  walletApplied?: number;   // เงินที่หักจาก parent wallet (บาท)
  refundDestination?: 'parent_wallet_credit' | null;
  refundAmount?: number;
  submittedAt?: Timestamp;  // เวลาที่ผู้ปกครองส่งสลิปเข้าตรวจ
  reviewedBy?: string;      // Admin UID ผู้ตรวจสอบ
  reviewedAt?: Timestamp;
  reviewNote?: string;
  escrowProcessed?: boolean;// guard — กันประมวลผลซ้ำ (แอป process แล้ว trigger จะข้าม)
  expiresAt?: Timestamp;    // วันหมดอายุของ QR/รายการชำระ (pending เกิน 1 วัน → ยกเลิกอัตโนมัติ)
  cancelledAt?: Timestamp;  // เวลาที่ถูกยกเลิก (รายการยกเลิกจะหายจากประวัติใน 3 วัน)
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
// PACKAGE (แพ็กเกจเรียน — ครูขายเป็นชุด จ่ายครั้งเดียว ได้เครดิตหลายครั้ง)
// =============================================
export interface Package {
  id: string;
  teacherId: string;
  teacherName: string;       // denormalized
  courseId: string;
  courseTitle: string;       // denormalized
  title: string;
  sessionsTotal: number;
  priceTotal: number;
  priceCurrency: string;
  discountPercent: number;   // ส่วนลดเทียบกับราคาต่อครั้ง × จำนวนครั้ง
  isActive: boolean;
  soldCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// PACKAGE PURCHASE (การซื้อแพ็กเกจ — ถือเครดิตครั้งเรียน)
// =============================================
export interface PackagePurchase {
  id: string;
  packageId: string;
  packageTitle: string;      // denormalized
  parentId: string;
  parentName: string;        // denormalized
  teacherId: string;
  courseId: string;
  courseTitle: string;       // denormalized
  studentId?: string | null;
  studentName: string;       // denormalized
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsRemaining: number; // stored (denormalized = total - used + refunded) for queries
  releasedSessions: number;  // จำนวนครั้งที่ปล่อย escrow ให้ครูแล้ว
  releasedNetTotal: number;  // ยอด net สะสมที่ปล่อยแล้ว
  taxWithheldTotal: number;  // ภาษีหัก ณ ที่จ่ายสะสม
  perSessionNet: number;     // net ต่อครั้ง (netAmount / sessionsTotal)
  amount: number;            // ยอดรวมที่จ่าย (gross, หลังส่วนลด)
  fees: number;
  netAmount: number;
  currency: string;
  status: 'pending' | 'active' | 'depleted' | 'cancelled' | 'refunded';
  paymentId?: string | null;
  lowCreditNotified?: boolean;
  depletedNotified?: boolean;
  expiresAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================
// CREDIT TRANSACTION (ledger หัก/คืนเครดิตแพ็กเกจ)
// =============================================
export interface CreditTransaction {
  id: string;
  purchaseId: string;
  parentId: string;
  teacherId: string;
  bookingId?: string | null;
  kind: 'purchase' | 'consume' | 'refund' | 'expire';
  sessionsDelta: number;     // +ได้เครดิต / -ใช้เครดิต
  balanceAfter: number;      // sessionsRemaining หลังรายการ
  createdAt: Timestamp;
}

// =============================================
// PARENT WALLET (เครดิตเงินบาทของผู้ปกครอง — รับเงินคืน/เลื่อนยกเลิก)
// =============================================
export interface ParentWallet {
  id: string;                // = parentId
  parentId: string;
  balance: number;           // เครดิตคงเหลือ (บาท)
  totalCredited: number;     // ยอดเครดิตเข้าสะสม
  totalSpent: number;        // ยอดใช้ไปสะสม
  updatedAt: Timestamp;
}

export interface ParentWalletTx {
  id: string;
  parentId: string;
  kind: 'refund' | 'spend' | 'reversal' | 'adjust';
  amount: number;            // +เครดิตเข้า / -ใช้หรือตัดออก
  balanceAfter: number;
  bookingId?: string | null;
  paymentId?: string | null;
  note?: string | null;
  createdAt: Timestamp;
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
// ANNOUNCEMENT (ข่าวสารจากศูนย์ — แดชบอร์ด)
// =============================================
// แอดมินเขียน → แสดงบนแดชบอร์ดผู้ปกครอง/ครู (แบบ pin ได้)
export interface Announcement {
  id: string;
  title: string;                                  // หัวข้อข่าว
  body: string;                                   // เนื้อหา (ข้อความ)
  audience: 'all' | 'parent' | 'teacher';        // กลุ่มเป้าหมาย
  category: 'promotion' | 'news' | 'general';    // ประชาสัมพันธ์โครงการ / ข่าวสารทั่วไป
  isPinned?: boolean;                             // ปักหมุดไว้บนสุด
  linkUrl?: string | null;                        // ลิงก์เพิ่มเติม (ถ้ามี)
  published: boolean;                             // ฉายจริงหรือฉบับร่าง
  publishedAt?: Timestamp | null;
  expiresAt?: Timestamp | null;                   // ถ้ากำหนด หมดอายุแล้วซ่อน
  createdBy: string;                              // uid แอดมิน
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
  PACKAGES: 'packages',
  PACKAGE_PURCHASES: 'packagePurchases',
  CREDIT_TRANSACTIONS: 'creditTransactions',
  PARENT_WALLETS: 'parentWallets',
  PARENT_WALLET_TXS: 'parentWalletTxs',
  TEACHER_VERIFICATION_EVENTS: 'teacherVerificationEvents',
  CONVERSATIONS: 'conversations',
  ANNOUNCEMENTS: 'announcements',
} as const;
