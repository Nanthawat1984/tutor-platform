// ย้ายแชทเดิม (messages ที่ผูกกับ bookingId) เข้าโครงสร้าง conversations ใหม่
// เพื่อให้คุยกันได้ตลอดเวลา ไม่ต้องผูกกับการจอง
//
//   node scripts/migrate-chat-to-conversations.cjs            # ดูอย่างเดียว
//   node scripts/migrate-chat-to-conversations.cjs --apply    # เขียนจริง
//
// ข้อมูลเดิมไม่ถูกลบ — ย้อนกลับได้ด้วยการชี้ UI กลับไปที่ /api/chat

const path = require('path');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');
const APPLY = process.argv.includes('--apply');

// ต้องตรงกับ conversationIdFor ใน src/types/chat.ts
function conversationIdFor(parentId, teacherId) {
  const key = [parentId, teacherId].sort().join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `c${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function formatBookingLabel(booking) {
  if (!booking || !booking.courseTitle) return null;
  if (!booking.bookingDate) return `การจอง: ${booking.courseTitle}`;
  const date = new Date(booking.bookingDate);
  const day = `${date.getDate()} ${date.toLocaleString('th-TH', { month: 'short' })}`;
  return `การจอง: ${booking.courseTitle} · ${day}`;
}

async function main() {
  const app = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  const db = getFirestore(app, 'tutor');

  const messageSnap = await db.collection('messages').get();
  console.log(`legacy messages: ${messageSnap.size}`);

  if (messageSnap.empty) {
    console.log('ไม่มีข้อความเดิมให้ย้าย');
    await app.delete();
    return;
  }

  // จัดกลุ่มตาม bookingId
  const byBooking = new Map();
  for (const doc of messageSnap.docs) {
    const data = doc.data();
    if (!data.bookingId) continue;
    if (!byBooking.has(data.bookingId)) byBooking.set(data.bookingId, []);
    byBooking.get(data.bookingId).push({ id: doc.id, data });
  }
  console.log(`bookings with messages: ${byBooking.size}`);

  const report = [];
  let messagesCopied = 0;
  let conversationsCreated = 0;

  for (const [bookingId, messages] of byBooking) {
    const bookingSnap = await db.collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) {
      console.warn(`skip ${bookingId}: booking ไม่มีแล้ว (${messages.length} ข้อความ)`);
      continue;
    }
    const booking = bookingSnap.data();
    if (!booking.parentId || !booking.teacherId) {
      console.warn(`skip ${bookingId}: booking ไม่มี parentId/teacherId`);
      continue;
    }

    const conversationId = conversationIdFor(booking.parentId, booking.teacherId);
    messages.sort((a, b) => {
      const ta = a.data.createdAt?.toMillis?.() ?? 0;
      const tb = b.data.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    });

    const convRef = db.collection('conversations').doc(conversationId);
    const existing = await convRef.get();

    if (!existing.exists) {
      const [parentSnap, teacherSnap] = await Promise.all([
        db.collection('users').doc(booking.parentId).get(),
        db.collection('users').doc(booking.teacherId).get(),
      ]);
      const parent = parentSnap.exists ? parentSnap.data() : {};
      const teacher = teacherSnap.exists ? teacherSnap.data() : {};
      const last = messages[messages.length - 1];

      if (APPLY) {
        await convRef.set({
          parentId: booking.parentId,
          teacherId: booking.teacherId,
          participantIds: [booking.parentId, booking.teacherId],
          parentName: parent.displayName || 'ผู้ปกครอง',
          teacherName: teacher.displayName || 'คุณครู',
          parentPhotoURL: parent.photoURL || null,
          teacherPhotoURL: teacher.photoURL || null,
          bookingId,
          contextLabel: formatBookingLabel(booking),
          lastMessageType: 'text',
          lastMessageText: String(last.data.text || '').slice(0, 120),
          lastMessageAt: last.data.createdAt || FieldValue.serverTimestamp(),
          lastSenderId: last.data.senderId,
          unreadParent: 0,
          unreadTeacher: 0,
          createdAt: last.data.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      conversationsCreated += 1;
    } else {
      // ห้องมีอยู่แล้ว (เช่นคุยก่อนจอง) — ผูก booking เข้าไปถ้ายังไม่มี
      const data = existing.data();
      if (APPLY && !data.bookingId) {
        await convRef.update({ bookingId, contextLabel: formatBookingLabel(booking) });
      }
    }

    const messagesRef = convRef.collection('messages');
    const batch = db.batch();
    let inBatch = 0;
    for (const message of messages) {
      // id เดิมถูกใช้เป็น clientMsgId — กันส่งซ้ำแล้วไม่โผล่ซ้ำ
      batch.set(messagesRef.doc(message.id), {
        conversationId,
        participantIds: [booking.parentId, booking.teacherId],
        senderId: message.data.senderId,
        senderRole: message.data.senderRole === 'teacher' ? 'teacher' : 'parent',
        type: 'text',
        text: message.data.text || '',
        audio: null,
        clientMsgId: message.id,
        createdAt: message.data.createdAt || FieldValue.serverTimestamp(),
      });
      inBatch += 1;
      if (inBatch === 400) {
        if (APPLY) await batch.commit();
        await batch.clear();
        inBatch = 0;
      }
    }
    if (APPLY && inBatch > 0) await batch.commit();
    messagesCopied += messages.length;

    report.push({
      bookingId,
      conversationId,
      messages: messages.length,
      teacherId: booking.teacherId,
    });
  }

  console.log(JSON.stringify({
    dryRun: !APPLY,
    conversationsCreated,
    messagesCopied,
    bookings: report,
  }, null, 2));

  await app.delete();
}

main().catch((error) => {
  console.error('migration failed:', error);
  process.exit(1);
});
