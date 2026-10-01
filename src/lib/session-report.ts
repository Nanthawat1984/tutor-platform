// Session report — ครูเขียนรายงานหลังเช็คชื่อ (topics/homework/คะแนน)
// ผู้ปกครองอ่านจากหน้า /progress (อ่าน sessionReports ทั้งหมดของตัวเองตาม parentId)
// เขียนได้เฉพาะเซสชันที่ "มาเรียน" แล้วเท่านั้น (attendance present) — กันรายงานลอย
// อัปเดตซ้ำได้ (upsert ตาม bookingId) — รุ่นล่าสุดชนะ, ผู้ปกครองได้รับแจ้งทุกครั้ง

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/types/firestore';
import { notifyUser } from '@/lib/line-outbox';
import { sanitizeReportInput, isReportEmpty } from '@/lib/session-report-validate';

export interface SessionReportInput {
  topicsCovered?: string;
  homework?: string;
  score?: number | null;
  notes?: string;
}

export type SessionReportResult =
  | { ok: true; reportId: string; created: boolean }
  | { ok: false; error: 'not_found' | 'forbidden' | 'attendance_missing' | 'invalid_input' };

// เช็คว่ามี attendance "มาเรียน" ของ booking นี้หรือยัง (present เท่านั้น — late ไม่นับ)
export async function hasPresentAttendance(db: Firestore, bookingId: string): Promise<boolean> {
  const snap = await db.collection(COLLECTIONS.ATTENDANCE)
    .where('bookingId', '==', bookingId)
    .limit(10)
    .get();
  return snap.docs.some((d) => d.data()?.status === 'present');
}

export async function upsertSessionReport(
  db: Firestore,
  input: {
    bookingId: string;
    teacherId: string;
    report: SessionReportInput;
  },
): Promise<SessionReportResult> {
  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(input.bookingId).get();
  if (!bookingSnap.exists) return { ok: false, error: 'not_found' };
  const booking = bookingSnap.data() as any;
  if (booking.teacherId !== input.teacherId) return { ok: false, error: 'forbidden' };

  // ต้องเช็คชื่อ "มา" แล้วเท่านั้น — กันรายงานเซสชันที่ยังไม่เกิด/นักเรียนไม่มา
  if (!(await hasPresentAttendance(db, input.bookingId))) {
    return { ok: false, error: 'attendance_missing' };
  }

  // validate + sanitize input (pure helpers — มี unit test ครอบ)
  const clean = sanitizeReportInput(input.report);
  if (clean.error) return { ok: false, error: 'invalid_input' };
  if (isReportEmpty(clean)) return { ok: false, error: 'invalid_input' }; // ต้องมีอย่างน้อยหนึ่งฟิลด์
  const { topicsCovered, homework, notes, score } = clean;

  // upsert — รายงานหนึ่งฉบับต่อการจอง (ดึงเดิมมาแก้ ไม่สร้างซ้ำ)
  const existingSnap = await db.collection(COLLECTIONS.SESSION_REPORTS)
    .where('bookingId', '==', input.bookingId)
    .limit(1)
    .get();
  const existing = existingSnap.docs[0];
  const sessionDate = String(booking.bookingDate || '');

  let reportId: string;
  let created: boolean;
  if (existing) {
    await existing.ref.update({
      topicsCovered,
      homework,
      score,
      notes,
      updatedAt: FieldValue.serverTimestamp(),
    });
    reportId = existing.id;
    created = false;
  } else {
    const ref = await db.collection(COLLECTIONS.SESSION_REPORTS).add({
      bookingId: input.bookingId,
      courseId: booking.courseId || null,
      courseTitle: booking.courseTitle || null,
      teacherId: booking.teacherId,
      parentId: booking.parentId,
      studentName: booking.studentName || null,
      sessionDate,
      topicsCovered,
      homework,
      score,
      notes,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    reportId = ref.id;
    created = true;
  }

  // แจ้งผู้ปกครอง (in-app + LINE) — event กันซ้ำตาม booking ผู้ปกครองจึงไม่โดนสแปมตอนแก้รายงาน
  const scoreText = score !== null ? ` คะแนน ${score}/100` : '';
  await notifyUser(db, {
    userId: booking.parentId,
    type: 'report',
    title: created ? 'รายงานผลการเรียนใหม่' : 'รายงานผลการเรียนถูกอัปเดต',
    body: `ครู${booking.teacherName || ''}บันทึกผลเรียนของ ${booking.studentName || 'นักเรียน'} วันที่ ${sessionDate}:${scoreText} เปิดดูได้ที่หน้าผลการเรียน`,
    data: { bookingId: input.bookingId, reportId },
    lineEventType: 'report.created',
    lineEntityId: input.bookingId,
    lineMessages: [{
      type: 'text',
      text: `📋 รายงานผลการเรียน${created ? '' : ' (อัปเดต)'}\n\nนักเรียน: ${booking.studentName || 'นักเรียน'}\nคอร์ส: ${booking.courseTitle || 'คอร์สเรียน'}\nวันที่: ${sessionDate}${scoreText}\n\nเปิดดูได้ที่หน้า "ผลการเรียน" ในเว็บ TutorPlatform 💖`,
    }],
  });

  return { ok: true, reportId, created };
}
