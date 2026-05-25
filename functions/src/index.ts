// Firebase Cloud Functions — TutorFinder
// วางที่: functions/src/index.ts
//
// Deploy:
//   cd functions
//   npm install
//   firebase deploy --only functions

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

// =============================================
// HELPER: Send LINE notification
// =============================================
async function sendLINENotify(message: string): Promise<void> {
  const channelAccessToken = functions.config().line?.channel_token;
  if (!channelAccessToken) {
    console.log('LINE channel token not configured, skipping notification');
    return;
  }

  // LINE Notify API (one-way)
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ message }),
    });
  } catch (error) {
    console.error('LINE notify error:', error);
  }
}

async function sendLINEPush(to: string, messages: Array<{ type: string; text: string }>): Promise<void> {
  const channelAccessToken = functions.config().line?.channel_token;
  if (!channelAccessToken) return;

  try {
    const fetch = (await import('node-fetch')).default;
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, messages }),
    });
  } catch (error) {
    console.error('LINE push error:', error);
  }
}

// =============================================
// NOTIFICATION TEMPLATES (Thai)
// =============================================
const Templates = {
  bookingConfirmed: (studentName: string, date: string, time: string) =>
    `✅ ยืนยันการจองเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}\nเวลา: ${time} น.\n\nกรุณามาตรงเวลานะคะ`,

  bookingCancelled: (studentName: string, date: string) =>
    `❌ ยกเลิกการจองเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}`,

  attendanceAlert: (studentName: string, status: string) => {
    const statusText = status === 'present' ? 'มาเรียน ✅' : status === 'absent' ? 'ขาดเรียน ❌' : 'มาสาย ⚠️';
    return `📋 แจ้งการเข้าเรียน\n\nนักเรียน: ${studentName}\nสถานะ: ${statusText}`;
  },

  sessionReport: (studentName: string, date: string) =>
    `📊 รายงานการเรียน\n\nนักเรียน: ${studentName}\nวันที่: ${date}\n\nครูได้บันทึกผลการเรียนแล้ว กรุณาตรวจสอบในแอพ`,

  paymentSuccess: (studentName: string, amount: string) =>
    `💳 ชำระเงินสำเร็จ\n\nนักเรียน: ${studentName}\nจำนวน: ${amount} บาท\n\nการจองได้รับการยืนยันแล้ว`,

  reviewReceived: (rating: number) =>
    `⭐ ได้รับรีวิวใหม่\n\nคะแนน: ${'⭐'.repeat(rating)}\n\nขอบคุณสำหรับ feedback คะ`,
};

// =============================================
// FIRESTORE TRIGGERS
// =============================================

// 1. เมื่อ booking status เปลี่ยน → ส่ง notification
export const onBookingStatusChange = functions.firestore
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
        break;
    }
  });

// 2. เมื่อ attendance ถูกบันทึก → แจ้งผู้ปกครอง
export const onAttendanceCreated = functions.firestore
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
  });

// 3. เมื่อ session report ถูกสร้าง → แจ้งผู้ปกครอง
export const onSessionReportCreated = functions.firestore
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
export const onReviewCreated = functions.firestore
  .document('reviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { teacherId, rating, comment } = data;

    await db.collection('notifications').add({
      userId: teacherId,
      type: 'review',
      title: 'ได้รับรีวิวใหม่',
      body: `คุณได้รับรีวิว ${rating} ดาว${comment ? `: "${comment}"` : ''}`,
      data: { reviewId: context.params.reportId, rating },
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

// 5. เมื่อ payment status เปลี่ยน → อัปเดต booking + แจ้ง
export const onPaymentStatusChange = functions.firestore
  .document('payments/{paymentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) return;

    const { bookingId, parentId, amount } = after;

    if (after.status === 'paid') {
      // Confirm booking
      await db.collection('bookings').doc(bookingId).update({
        status: 'confirmed',
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Notify parent
      const bookingSnap = await db.collection('bookings').doc(bookingId).get();
      const booking = bookingSnap.data();

      if (booking) {
        await db.collection('notifications').add({
          userId: parentId,
          type: 'payment',
          title: 'ชำระเงินสำเร็จ',
          body: `การจองเรียนของ ${booking.studentName} ได้รับการยืนยันแล้ว`,
          data: { bookingId, paymentId: context.params.paymentId },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (after.status === 'refunded') {
      await db.collection('bookings').doc(bookingId).update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

// =============================================
// HTTP FUNCTIONS (API endpoints)
// =============================================

// Payment webhook — รับ callback จาก Omise/2C2P
export const paymentWebhook = functions.https.onRequest(async (req, res) => {
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

// LINE Webhook — รับข้อความจากผู้ใช้
export const lineWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const { events } = req.body;

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const text = event.message.text;

        // Simple bot logic
        let reply = '';

        if (text.includes('สวัสดี') || text.includes('hello')) {
          reply = 'สวัสดีครับ! ยินดีต้อนรับสู่ TutorFinder 🎓\n\nคุณสามารถ:\n- พิมพ์ "ค้นหา" เพื่อค้นหาครู\n- พิมพ์ "จอง" เพื่อดูการจอง\n- พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด';
        } else if (text.includes('ค้นหา')) {
          reply = 'กรุณาเปิดเว็บไซต์ TutorFinder เพื่อค้นหาครูพิเศษครับ 🔍\n\n🔗 https://tutor-platform-4e38f.web.app';
        } else if (text.includes('จอง')) {
          reply = 'กรุณาเปิดเว็บไซต์ TutorFinder เพื่อดูการจองของคุณครับ 📅';
        } else if (text.includes('ช่วยเหลือ')) {
          reply = '📋 คำสั่งที่ใช้ได้:\n- "ค้นหา" — ค้นหาครู\n- "จอง" — ดูการจอง\n- "ช่วยเหลือ" — ดูคำสั่งทั้งหมด';
        } else {
          reply = 'ขออภัยครับ ผมไม่เข้าใจ กรุณาพิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งที่ใช้ได้';
        }

        // Reply via LINE Messaging API
        const channelAccessToken = functions.config().line?.channel_token;
        if (channelAccessToken && event.replyToken) {
          const fetch = (await import('node-fetch')).default;
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${channelAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: reply }],
            }),
          });
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================
// SCHEDULED FUNCTIONS
// =============================================

// ทุกเช้า 9:00 น. — ส่ง reminder สำหรับเซสชันวันนี้
export const dailyBookingReminder = functions.pubsub
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
export const updateTeacherStats = functions.pubsub
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
