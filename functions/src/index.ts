// Firebase Cloud Functions — TutorFinder
// วางที่: functions/src/index.ts
//
// Deploy:
//   cd functions
//   npm install
//   firebase deploy --only functions

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { dispatchLineOutbox, OUTBOX_COLLECTION } from './line/outbox';
import {
  enqueueAttendanceChanged,
  enqueueBookingCreated,
  enqueueBookingStatusChanged,
  enqueuePaymentChanged,
  enqueuePaymentReleased,
} from './line/events';
import { getLineServerConfig } from './line/config';
import { replyLineMessages } from './line/client';
import { verifyLineWebhookSignature } from './line/security';
import { assignRoleRichMenu } from './line/rich-menu';

// Lazy init — อย่า initializeApp ตอน module load
// (deploy analysis server จะ timeout 10s ถ้า init ช้า)
let _db: FirebaseFirestore.Firestore | null = null;
function getDb(): FirebaseFirestore.Firestore {
  if (!_db) {
    const app = admin.initializeApp();
    _db = getFirestore(app, 'tutor');
  }
  return _db;
}
// Proxy เพื่อให้ `db.collection(...)` เดิมทำงานได้โดยไม่ต้องแก้ทุกจุด
const db = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    const value = (getDb() as any)[prop];
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
});

const lineRuntime = () => functions.runWith({
  secrets: ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'],
});

// =============================================
// FIRESTORE TRIGGERS
// =============================================

// 1. เมื่อ booking status เปลี่ยน → ส่ง notification
// ต้องอยู่ region เดียวกับ Firestore database (asia-southeast1)
export const onBookingStatusChange = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('bookings/{bookingId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const { bookingId } = context.params;

    if (before.status === after.status) return;

    const { studentName, bookingDate, startTime, parentId, teacherId } = after;

    // Create in-app notification
    let title = '';
    let body = '';
    let type = '';

    switch (after.status) {
      case 'confirmed':
        title = 'ยืนยันการจอง';
        body = `การจองเรียนของ ${studentName} ได้รับการยืนยันแล้ว`;
        type = 'booking';
        // Notify parent
        await db.collection('notifications').add({
          userId: parentId,
          type,
          title,
          body,
          data: { bookingId, status: 'confirmed' },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        break;

      case 'cancelled':
        title = 'ยกเลิกการจอง';
        body = `การจองเรียนของ ${studentName} ถูกยกเลิก`;
        type = 'booking';
        await db.collection('notifications').add({
          userId: parentId,
          type,
          title,
          body,
          data: { bookingId, status: 'cancelled' },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        break;

      case 'completed':
        title = 'เรียนเสร็จสิ้น';
        body = `เซสชันเรียนของ ${studentName} เสร็จสิ้นแล้ว — อย่าลืมรีวิวครูนะคะ`;
        type = 'booking';
        await db.collection('notifications').add({
          userId: parentId,
          type,
          title,
          body,
          data: { bookingId, status: 'completed' },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // ปล่อย escrow → ย้าย pendingBalance → availableBalance ของครู
        await releaseEscrow(bookingId);
        break;
    }

    await enqueueBookingStatusChanged(db, bookingId, before, after);
  });

// เมื่อมีการสร้าง booking ใหม่ → แจ้งครูทันที แม้ payment ยัง pending
export const onBookingCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    await enqueueBookingCreated(db, context.params.bookingId, snap.data());
  });

// Helper: ปล่อย escrow เมื่อเรียนเสร็จ (ย้าย pending → available ของครู)
async function releaseEscrow(bookingId: string): Promise<void> {
  try {
    const paymentsSnap = await db.collection('payments')
      .where('bookingId', '==', bookingId)
      .where('status', '==', 'paid')
      .limit(1)
      .get();
    if (paymentsSnap.empty) return;
    const payment = paymentsSnap.docs[0].data();
    const teacherId = payment.teacherId;
    const netAmount = Number(payment.netAmount) || 0;
    if (!teacherId || netAmount <= 0) return;

    const walletRef = db.collection('wallets').doc(teacherId);
    const walletSnap = await walletRef.get();
    if (walletSnap.exists) {
      await walletRef.update({
        pendingBalance: FieldValue.increment(-netAmount),
        availableBalance: FieldValue.increment(netAmount),
        totalEarned: FieldValue.increment(netAmount),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await enqueuePaymentReleased(db, bookingId, payment);
    }
  } catch (e) {
    console.error('releaseEscrow error:', e);
  }
}

// 2. เมื่อ attendance ถูกบันทึก → แจ้งผู้ปกครอง
export const onAttendanceCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('attendance/{attendanceId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { bookingId, studentName, status, sessionDate } = data;

    // Get booking to find parent
    const bookingSnap = await db.collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) return;
    const booking = bookingSnap.data()!;

    const statusText = status === 'present' ? 'มาเรียน ✅' : status === 'absent' ? 'ขาดเรียน ❌' : 'มาสาย ⚠️';

    await db.collection('notifications').add({
      userId: booking.parentId,
      type: 'attendance',
      title: 'แจ้งการเข้าเรียน',
      body: `${studentName}: ${statusText}`,
      data: { bookingId, attendanceId: context.params.attendanceId, status },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await enqueueAttendanceChanged(db, context.params.attendanceId, null, data, booking);
  });

export const onAttendanceUpdated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('attendance/{attendanceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status) return;
    const bookingSnap = await db.collection('bookings').doc(after.bookingId).get();
    if (!bookingSnap.exists) return;
    await enqueueAttendanceChanged(db, context.params.attendanceId, before, after, bookingSnap.data()!);
  });

// 3. เมื่อ session report ถูกสร้าง → แจ้งผู้ปกครอง
export const onSessionReportCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('sessionReports/{reportId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { parentId, studentName, sessionDate, courseTitle } = data;

    await db.collection('notifications').add({
      userId: parentId,
      type: 'report',
      title: 'มีรายงานการเรียนใหม่',
      body: `ครูได้บันทึกผลการเรียน "${courseTitle}" ของ ${studentName}`,
      data: { reportId: context.params.reportId },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

// 4. เมื่อ review ถูกสร้าง → แจ้งครู
export const onReviewCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('reviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { teacherId, rating, comment } = data;

    await db.collection('notifications').add({
      userId: teacherId,
      type: 'review',
      title: 'ได้รับรีวิวใหม่',
      body: `คุณได้รับรีวิว ${rating} ดาว${comment ? `: "${comment}"` : ''}`,
      data: { reviewId: context.params.reviewId, rating },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

// 5. เมื่อ payment status เปลี่ยน → อัปเดต booking + escrow + แจ้ง
//    ถ้าแอป (Next.js) ประมวลผลไปแล้ว (escrowProcessed=true) จะข้ามเพื่อกันซ้ำ
export const onPaymentStatusChange = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('payments/{paymentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) return;

    const bookingForLineSnap = await db.collection('bookings').doc(after.bookingId).get();
    const bookingForLine = bookingForLineSnap.exists ? bookingForLineSnap.data()! : null;
    await enqueuePaymentChanged(db, context.params.paymentId, before, after, bookingForLine);
    if (after.escrowProcessed) return; // แอปประมวลผลแล้ว — ข้าม

    const { bookingId, parentId, amount, teacherId, netAmount, studentName } = after;

    if (after.status === 'paid') {
      // Confirm booking
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingSnap = await bookingRef.get();
      const booking = bookingSnap.exists ? bookingSnap.data() : null;

      if (booking && booking.status === 'pending') {
        await bookingRef.update({
          status: 'confirmed',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Escrow: เติม pendingBalance ของครู (ครั้งแรกที่จ่าย)
        if (teacherId && netAmount > 0) {
          const walletRef = db.collection('wallets').doc(teacherId);
          const walletSnap = await walletRef.get();
          if (walletSnap.exists) {
            await walletRef.update({
              pendingBalance: FieldValue.increment(netAmount),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            await walletRef.set({
              teacherId,
              pendingBalance: netAmount,
              availableBalance: 0,
              totalEarned: 0,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      }

      // Notify parent
      if (booking) {
        await db.collection('notifications').add({
          userId: parentId,
          type: 'payment',
          title: 'ชำระเงินสำเร็จ',
          body: `การจองเรียนของ ${studentName || booking.studentName} ได้รับการยืนยันแล้ว (${amount} บาท)`,
          data: { bookingId, paymentId: context.params.paymentId },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (after.status === 'refunded') {
      // ลด pending balance ของครู (ถ้ามี)
      if (teacherId && netAmount > 0) {
        const walletRef = db.collection('wallets').doc(teacherId);
        const walletSnap = await walletRef.get();
        if (walletSnap.exists) {
          await walletRef.update({
            pendingBalance: FieldValue.increment(-netAmount),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      await db.collection('bookings').doc(bookingId).update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

export const onPaymentCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const payment = snap.data();
    const bookingSnap = await db.collection('bookings').doc(payment.bookingId).get();
    if (!bookingSnap.exists) return;
    await enqueuePaymentChanged(db, context.params.paymentId, null, payment, bookingSnap.data()!);
  });

// Outbox dispatcher — ส่งทันทีเมื่อมี event และ retry failed records ทุกนาที
export const onLineNotificationCreated = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document(`${OUTBOX_COLLECTION}/{notificationId}`)
  .onCreate(async (_snap, context) => {
    await dispatchLineOutbox(db, context.params.notificationId);
  });

export const onUserLineLinked = lineRuntime().region('asia-southeast1').firestore
  .database('tutor')
  .document('users/{uid}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.lineUserId === after.lineUserId || !after.lineUserId) return;
    if (after.role !== 'parent' && after.role !== 'teacher') return;
    await assignRoleRichMenu(after.lineUserId, after.role);
  });

export const retryLineNotifications = lineRuntime().region('asia-southeast1').pubsub
  .schedule('every 1 minutes')
  .timeZone('Asia/Bangkok')
  .onRun(async () => {
    const snap = await db.collection(OUTBOX_COLLECTION)
      .where('status', 'in', ['pending', 'failed'])
      .limit(100)
      .get();
    const now = Date.now();
    for (const doc of snap.docs) {
      const nextAttemptAt = doc.data().nextAttemptAt?.toMillis?.() || 0;
      if (nextAttemptAt <= now) await dispatchLineOutbox(db, doc.id);
    }
  });

// =============================================
// HTTP FUNCTIONS (API endpoints)
// =============================================

// Payment webhook — รับ callback จาก Omise/2C2P
export const paymentWebhook = lineRuntime().https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const { event, data } = req.body;

    switch (event) {
      case 'charge.complete':
      case 'payment.success': {
        const bookingId = data.metadata?.booking_id;
        const transactionId = data.id || data.transaction_id;

        // Find payment by bookingId
        const paymentsSnap = await db.collection('payments')
          .where('bookingId', '==', bookingId)
          .where('status', '==', 'pending')
          .limit(1)
          .get();

        if (!paymentsSnap.empty) {
          await paymentsSnap.docs[0].ref.update({
            status: 'paid',
            transactionId,
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      }

      case 'charge.failed':
      case 'payment.failed': {
        const bookingId = data.metadata?.booking_id;
        const paymentsSnap = await db.collection('payments')
          .where('bookingId', '==', bookingId)
          .where('status', '==', 'pending')
          .limit(1)
          .get();

        if (!paymentsSnap.empty) {
          await paymentsSnap.docs[0].ref.update({
            status: 'failed',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      }

      case 'refund.complete': {
        const bookingId = data.metadata?.booking_id;
        const paymentsSnap = await db.collection('payments')
          .where('bookingId', '==', bookingId)
          .limit(1)
          .get();

        if (!paymentsSnap.empty) {
          await paymentsSnap.docs[0].ref.update({
            status: 'refunded',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// LINE Webhook — ตรวจ signature ก่อน parse และไม่ query ข้อมูลส่วนตัวโดยไม่มี link
export const lineWebhook = lineRuntime().region('asia-southeast1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const config = getLineServerConfig();
  if (!config.enabled) {
    res.json({ ok: true, disabled: true });
    return;
  }

  try {
    const requestWithRawBody = req as typeof req & { rawBody?: Buffer };
    const rawBody = requestWithRawBody.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.get('x-line-signature') || '';
    if (!verifyLineWebhookSignature(rawBody, signature, config.channelSecret)) {
      res.status(401).send('Invalid signature');
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as { events?: Array<any> };
    const events = Array.isArray(payload.events) ? payload.events : [];
    const liffUrl = config.liffId ? `https://liff.line.me/${config.liffId}` : `${config.appUrl}/my-profile`;

    for (const event of events) {
      if (!event.replyToken) continue;
      let messages: Array<Record<string, unknown>> = [];

      if (event.type === 'follow') {
        messages = [
          { type: 'text', text: `สวัสดีค่ะ ยินดีต้อนรับสู่ TutorPlatform 🎓\n\nเพิ่มเพื่อน OA ${config.officialAccountId} แล้วกดเชื่อมบัญชี เพื่อรับแจ้งเตือนการเรียนแบบน่ารัก ๆ นะคะ 💖` },
          { type: 'template', altText: 'เชื่อมต่อบัญชี TutorPlatform', template: { type: 'buttons', text: 'พร้อมรับแจ้งเตือนแล้วหรือยังคะ?', actions: [{ type: 'uri', label: 'เชื่อมต่อบัญชี', uri: liffUrl }] } },
        ];
      } else if (event.type === 'postback') {
        messages = [{ type: 'text', text: 'ได้รับคำสั่งแล้วค่ะ เปิดเมนูเพื่อไปต่อได้เลยนะคะ 🌈' }];
      } else if (event.type === 'message' && event.message?.type === 'text') {
        const text = String(event.message.text || '');
        const reply = text.includes('ช่วยเหลือ')
          ? `📋 เมนูช่วยเหลือ\n\nกด Rich Menu เพื่อดูการจอง ตารางเรียน เช็คชื่อ ค่าเรียน หรือเชื่อมบัญชีค่ะ\n\n${liffUrl}`
          : text.includes('เชื่อมบัญชี')
            ? `🔗 กดที่นี่เพื่อเชื่อมบัญชี TutorPlatform ค่ะ\n\n${liffUrl}`
            : text.includes('จอง')
              ? `📅 เปิดดูการจองของคุณได้ที่นี่ค่ะ\n\n${config.appUrl}/bookings`
              : 'สวัสดีค่ะ 💖 พิมพ์ “ช่วยเหลือ” หรือกด Rich Menu เพื่อเริ่มใช้งานนะคะ';
        messages = [{ type: 'text', text: reply }];
      }

      if (messages.length > 0) {
        try {
          await replyLineMessages(event.replyToken, messages);
        } catch (error) {
          console.error('LINE reply failed:', error instanceof Error ? error.message : 'unknown_error');
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('LINE webhook error:', error instanceof Error ? error.message : 'unknown_error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================
// SCHEDULED FUNCTIONS
// =============================================

// ทุกเช้า 9:00 น. — ส่ง reminder สำหรับเซสชันวันนี้
export const dailyBookingReminder = lineRuntime().pubsub
  .schedule('0 9 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    const today = new Date().toISOString().split('T')[0];

    const bookingsSnap = await db.collection('bookings')
      .where('bookingDate', '==', today)
      .where('status', '==', 'confirmed')
      .get();

    for (const doc of bookingsSnap.docs) {
      const booking = doc.data();
      await db.collection('notifications').add({
        userId: booking.parentId,
        type: 'reminder',
        title: 'เตรียมเรียนวันนี้!',
        body: `${booking.studentName} มีเซสชันเรียนวันนี้ เวลา ${booking.startTime} น.`,
        data: { bookingId: doc.id },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    console.log(`Sent ${bookingsSnap.size} booking reminders`);
  });

// ทุก 1 ชั่วโมง — อัปเดต teacher stats
export const updateTeacherStats = lineRuntime().pubsub
  .schedule('0 * * * *')
  .onRun(async (context) => {
    const teachersSnap = await db.collection('teachers').get();

    for (const doc of teachersSnap.docs) {
      const teacherId = doc.id;

      // Count total students (unique)
      const bookingsSnap = await db.collection('bookings')
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'completed')
        .get();

      const uniqueStudents = new Set(bookingsSnap.docs.map((d) => d.data().studentName));

      await doc.ref.update({
        totalStudents: uniqueStudents.size,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    console.log(`Updated stats for ${teachersSnap.size} teachers`);
  });

// =============================================
// WEEKLY PAYOUT CYCLE (รอบโอนเงินรายสัปดาห์)
// - วันอังคาร 09:00: สรุปยอดที่ต้องโอน → แจ้งแอดมิน
// - วันพฤหัสบดี 16:00: แจ้งเตือนให้โอน (โอนตั้งแต่ 17:00 เป็นต้นไป)
// =============================================

async function notifyAdmins(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  for (const doc of adminsSnap.docs) {
    await db.collection('notifications').add({
      userId: doc.id,
      type: 'payout',
      title,
      body,
      data: data || {},
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

// ทุกวันอังคาร 09:00 (เวลาไทย) — สรุปยอดคำขอเบิกเงินที่รออยู่
export const weeklyPayoutSummary = lineRuntime().pubsub
  .schedule('0 9 * * 2')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    const requestedSnap = await db.collection('payouts')
      .where('status', '==', 'requested')
      .get();

    let totalAmount = 0;
    const teacherIds = new Set<string>();
    for (const doc of requestedSnap.docs) {
      totalAmount += Number(doc.data().amount) || 0;
      teacherIds.add(doc.data().teacherId);
    }

    await notifyAdmins(
      '📊 สรุปยอดโอนเงินประจำสัปดาห์',
      `มีคำขอเบิกเงินรอดำเนินการ ${requestedSnap.size} รายการ (${teacherIds.size} ครู)\nยอดรวม: ${totalAmount.toLocaleString('th-TH')} บาท\n\n📅 กำหนดโอน: พฤหัสบดีนี้ 17:00 เป็นต้นไป`,
      { count: requestedSnap.size, totalAmount },
    );

    console.log(`Payout summary: ${requestedSnap.size} requests, total ${totalAmount} THB`);
  });

// ทุกวันพฤหัสบดี 16:00 (เวลาไทย) — เตือนให้โอนเงิน (โอนได้ตั้งแต่ 17:00)
export const weeklyPayoutReminder = lineRuntime().pubsub
  .schedule('0 16 * * 4')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    const pendingSnap = await db.collection('payouts')
      .where('status', 'in', ['requested', 'processing'])
      .get();

    if (pendingSnap.empty) {
      console.log('No payouts to transfer this week');
      return;
    }

    let totalAmount = 0;
    for (const doc of pendingSnap.docs) {
      totalAmount += Number(doc.data().amount) || 0;
    }

    await notifyAdmins(
      '⏰ ถึงเวลาโอนเงินครู',
      `วันนี้ 17:00 เป็นต้นไป ถึงรอบโอนเงินประจำสัปดาห์\n\nรายการค้าง: ${pendingSnap.size} รายการ\nยอดรวม: ${totalAmount.toLocaleString('th-TH')} บาท\n\nกรุณาโอนและแนบหลักฐานในหน้าจัดการการเบิกเงิน`,
      { count: pendingSnap.size, totalAmount },
    );

    console.log(`Payout reminder sent: ${pendingSnap.size} payouts, total ${totalAmount} THB`);
  });
