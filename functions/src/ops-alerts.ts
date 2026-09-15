import * as functions from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Ops alerting (P3 big bet) — every 30 min, counts failure queues and writes
// ONE admin notification when thresholds are crossed. Admins see it in-app
// (/notifications) instead of needing to poll ops-snapshot. Thresholds are
// deliberately high to avoid noise; tune per traffic.
const ALERT_DOC = 'opsAlerts/hourly';

export const opsAlertMonitor = functions
  .runWith({ secrets: ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'] })
  .region('asia-southeast1')
  .pubsub.schedule('every 30 minutes')
  .timeZone('Asia/Bangkok')
  .onRun(async () => {
    const db = getFirestore('tutor');
    const [failedOutbox, stuckWebhooks, awaitingReview] = await Promise.all([
      db.collection('lineNotificationOutbox').where('status', '==', 'failed').count().get(),
      db.collection('stripeWebhookEvents').where('status', '==', 'processing').count().get(),
      db.collection('payments').where('status', '==', 'awaiting_review').count().get(),
    ]);
    const counts = {
      lineOutboxFailed: failedOutbox.data().count,
      stripeStuck: stuckWebhooks.data().count,
      awaitingReview: awaitingReview.data().count,
    };
    const breach = counts.lineOutboxFailed >= 10 || counts.stripeStuck >= 5 || counts.awaitingReview >= 20;
    if (!breach) return;

    // Throttle: at most one alert doc per hour per breach signature.
    const alertRef = db.collection(ALERT_DOC.split('/')[0]).doc(ALERT_DOC.split('/')[1]);
    const last = await alertRef.get();
    const lastAt = last.exists ? last.data()?.at?.toMillis?.() || 0 : 0;
    if (Date.now() - lastAt < 60 * 60_000) return;
    await alertRef.set({ ...counts, at: FieldValue.serverTimestamp() });

    const admins = await db.collection('users').where('role', '==', 'admin').limit(20).get();
    const body = `LINE ล้มเหลว ${counts.lineOutboxFailed} • webhook ค้าง ${counts.stripeStuck} • สลิปรอตรวจ ${counts.awaitingReview}`;
    for (const admin of admins.docs) {
      await db.collection('notifications').add({
        userId: admin.id,
        type: 'system',
        title: '⚠️ สัญญาณเตือนระบบ',
        body,
        data: { ...counts },
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
