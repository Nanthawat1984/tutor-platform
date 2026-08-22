# LINE OA + LIFF Notification Design

## Goal

เชื่อม TutorPlatform กับ LINE Official Account `@966mqfzj` ผ่าน LIFF/Login เพื่อให้ผู้ปกครองและครูผูกบัญชีได้อย่างปลอดภัย รับการแจ้งเตือนตามบทบาท และใช้ Rich Menu ที่เหมาะกับงานของแต่ละบทบาท โดยไม่ทำให้การจองหรือการชำระเงินล้มเหลวเมื่อ LINE ใช้งานไม่ได้

## Existing context

- แอปหลักใช้ Next.js, Firebase Auth และ Firestore database `tutor`
- มี Firebase Cloud Functions ที่ `functions/src/index.ts` สำหรับ booking, attendance, payment และ LINE webhook อยู่แล้ว
- มี in-app collection `notifications` อยู่แล้ว แต่ยังไม่มีการเก็บ LINE identity และไม่มี reliable outbox/idempotency
- ฟังก์ชัน LINE เดิมอ่าน token จาก `functions.config()` และมีทั้ง LINE Notify กับ Messaging API push; งานนี้จะรวมให้ใช้ LINE Messaging API + LIFF เป็นเส้นทางหลัก
- working tree มีการแก้ไขจากงานก่อนหน้าในหลายไฟล์ ต้องแก้เฉพาะส่วนที่เกี่ยวข้องและห้าม reset/ทับการเปลี่ยนแปลงเดิม

## Assumptions

- ผู้ใช้จะเข้าสู่ระบบ TutorPlatform ก่อนกดเชื่อม LINE จากหน้า profile/settings; LIFF จะใช้บัญชี Firebase session เดิมเป็นหลักในการยืนยันว่าใครกำลังผูกบัญชี
- ผู้ใช้ต้องเพิ่ม OA `@966mqfzj` เป็นเพื่อนก่อนจึงจะรับ push message เฉพาะบุคคลได้
- การสร้าง/อัปเดต Rich Menu ใช้ LINE Messaging API และ asset ภาพการ์ตูนที่ version control ได้ ไม่ต้องเพิ่มบริการ backend หรือฐานข้อมูลใหม่
- “MCP LINEOA” ตีความเป็นความสามารถเชื่อมต่อ LINE OA; ใน repository จะใช้ official LINE APIs ผ่าน Firebase Functions เพราะไม่มี LINE OA MCP plugin ที่ติดตั้งใช้งานได้ใน workspace นี้
- การแจ้งเตือน LINE เป็นช่องทางเสริม; in-app notification และธุรกรรมหลักยังเป็น authoritative

## Recommended architecture

### 1. Identity linking

เพิ่มหน้า/ปุ่ม `เชื่อมต่อ LINE OA` ในพื้นที่ผู้ใช้ โดย flow เป็น:

1. ตรวจว่าผู้ใช้มี Firebase session
2. เปิด LIFF ด้วย `NEXT_PUBLIC_LINE_LIFF_ID`
3. เรียก `liff.login()` เมื่อยังไม่ได้ login LINE
4. ส่ง LIFF ID token ไป server route พร้อม Firebase bearer session
5. Server ตรวจ Firebase token และตรวจ LIFF ID token กับ LINE verify endpoint โดยใช้ configured LIFF channel ID
6. ตรวจว่า LINE token มี `sub`/user ID ที่ถูกต้องและ channel ตรงกับระบบ
7. เขียนเฉพาะ `users/{firebaseUid}` ของผู้เรียก พร้อม `lineUserId`, `lineLinkedAt`, `lineNotificationEnabled: true`
8. แสดงสถานะ linked และลิงก์ให้เพิ่ม OA หากผู้ใช้ยังไม่ได้เป็นเพื่อน

ห้ามรับ `lineUserId` ที่ client ส่งมาเป็นข้อมูลที่เชื่อถือได้ และห้ามเก็บ LIFF access token หรือ ID token ลง Firestore

### 2. Notification outbox

เพิ่ม collection `lineNotificationOutbox` เพื่อแยกการส่งข้อความออกจากธุรกรรมหลัก เอกสารแต่ละรายการใช้ deterministic ID จาก `eventType + entityId + recipientUid` เพื่อกัน duplicate จากทั้ง Next.js และ Cloud Functions

ฟิลด์หลัก:

- `recipientUid`
- `lineUserId`
- `eventType`
- `entityId`
- `message` หรือ structured message payload
- `status`: `pending | sending | sent | failed | skipped`
- `attempts`, `lastError`, `nextAttemptAt`
- `createdAt`, `sentAt`, `updatedAt`

Dispatcher ส่งผ่าน `POST /v2/bot/message/push` ด้วย channel access token ฝั่ง server เท่านั้น หากผู้ใช้ยังไม่ link, ปิดแจ้งเตือน, หรือ LINE ตอบว่า user ใช้งานไม่ได้ ให้บันทึกสถานะและไม่ retry แบบไม่สิ้นสุด

การ retry จำกัดจำนวนครั้งและใช้ backoff; ความล้มเหลวของ dispatcher ต้องไม่ throw กลับไปทำให้ booking/payment transaction ล้มเหลว

### 3. Event mapping

| Event | ผู้รับ | เนื้อหา |
|---|---|---|
| `booking.created` | ครู | นักเรียน, คอร์ส, วันเวลา, สถานที่, จำนวนผู้เรียนปัจจุบัน/สูงสุด |
| `booking.confirmed` | ผู้ปกครองและครู | ผลยืนยันการจองและรายละเอียดวันเวลา |
| `booking.cancelled` | ผู้ปกครองและครู | ผลยกเลิกและรายละเอียดที่เกี่ยวข้อง |
| `payment.pending` | ผู้ปกครอง | ค่าเรียนที่ต้องชำระและลิงก์กลับเข้าแอป |
| `payment.paid` | ผู้ปกครอง | ชำระสำเร็จ ยอดเงิน และการยืนยันการจอง |
| `payment.paid` | ครู | รายการจองและผลตอบแทนสุทธิที่เข้าระบบ escrow |
| `attendance.changed` | ผู้ปกครอง | ชื่อนักเรียน วันที่ และสถานะ มา/ขาด/สาย |
| `payment.released` | ครู | ผลตอบแทนที่ปล่อยจาก escrowและยอดสุทธิ |

`booking.created` ต้องเกิดเมื่อมีการกดจอง แม้ payment ยัง pending เพื่อให้ครูทราบว่ามีผู้จองเข้ามา ส่วน `payment.paid` เป็น event หลักสำหรับยืนยันการจองและแจ้งค่าเรียนสำเร็จ

การเช็คชื่อปัจจุบันใช้การเพิ่ม attendance document ทุกครั้งที่กดปุ่ม งาน implementation ต้องทำให้ notification key ไม่ส่งซ้ำโดยไม่จำเป็น และส่งเมื่อสถานะเปลี่ยนจริงเท่านั้น โดยไม่เปลี่ยนความหมายของสถานะในหน้าครู

### 4. Existing trigger integration

ปรับ `functions/src/index.ts` ให้มี notification builder กลางและใช้ร่วมกับ:

- booking onCreate/onUpdate
- attendance onCreate/onUpdate หรือเส้นทาง upsert ที่มีอยู่
- payment status update
- escrow release ที่มีอยู่
- LINE webhook

ต้องตรวจ duplicate ระหว่าง `markPaymentPaid` ใน Next.js กับ `onPaymentStatusChange` ใน Functions ก่อนเปิดใช้จริง เพราะปัจจุบันทั้งสองเส้นทางสร้าง in-app notification ได้

### 5. LINE webhook

รักษา endpoint `lineWebhook` แต่เพิ่ม:

- รับเฉพาะ POST
- ตรวจ `x-line-signature` ด้วย HMAC-SHA256 จาก raw request body และ channel secret
- ตอบ 200 ให้เร็วหลัง parse/queue event
- รองรับ follow event, message event และ postback จาก Rich Menu
- เมื่อ follow ให้ส่งข้อความต้อนรับพร้อมปุ่มเปิด LIFF และคำแนะนำให้เชื่อมบัญชี
- ข้อความจากผู้ใช้ใช้คำสั่งแบบเรียบง่ายและนำทางกลับเข้าแอป ไม่ทำ query ข้อมูลส่วนตัวโดยไม่มี linked identity

### 6. Rich Menu

สร้าง role-specific Rich Menu แบบ 6 ช่อง โทนการ์ตูนน่ารัก ชมพู/ม่วง/ฟ้า ใช้ action เป็น LIFF URL หรือ HTTPS app URL:

ผู้ปกครอง:

- การจองของฉัน
- ตารางเรียน
- ผลการเข้าเรียนของลูก
- ค่าเรียน/การชำระเงิน
- เชื่อมบัญชี
- ติดต่อทีมงาน

ครู:

- รายการจองใหม่
- ตารางสอน
- เช็คชื่อวันนี้
- สถานที่เรียน
- รายได้/ผลตอบแทน
- ติดต่อทีมงาน

ก่อน link ให้ใช้ default menu ที่มีปุ่มเชื่อมบัญชีและช่วยเหลือ; หลัง link สำเร็จให้ assign menu ตาม role ด้วย LINE API

## Configuration and secrets

เพิ่มเฉพาะตัวแปรที่จำเป็นใน `.env.example` และ config ของ Functions โดยไม่ใส่ค่าจริง:

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `NEXT_PUBLIC_LINE_LIFF_ID`
- `LINE_OFFICIAL_ACCOUNT_ID=@966mqfzj`
- `LINE_NOTIFICATIONS_ENABLED=false` เป็นค่าเริ่มต้นจนกว่าจะผ่าน smoke test
- public app base URL สำหรับ LIFF/menu links

Secret ต้องอยู่ใน server/Functions secret configuration เท่านั้น; LIFF ID และ OA ID เปิดเผยฝั่ง client ได้ แต่ token/secret ห้ามส่งเข้า browser หรือ log

## Security and privacy

- ตรวจ Firebase session และสิทธิ์ของผู้เรียกทุกครั้งที่ link/unlink
- ตรวจ LIFF ID token ฝั่ง server และผูกได้เฉพาะ Firebase UID ของ session นั้น
- ป้องกันการผูก LINE user เดียวกับหลายบัญชีโดยใช้ transaction/unique lookup
- ตรวจ webhook signature ก่อนอ่าน event
- Rich Menu และข้อความไม่แสดง KYC, เลขบัญชี, เลขบัตรประชาชน หรือข้อมูลนักเรียนเกินจำเป็น
- เพิ่ม unlink/disable notification ให้ผู้ใช้หยุดการแจ้งเตือนได้
- Firestore rules ไม่เปิดให้ client เขียน `lineUserId` หรือ outbox โดยตรง

## Failure handling and rollout

- `LINE_NOTIFICATIONS_ENABLED=false` จนกว่าจะตั้งค่า channel/LIFF/webhook ครบ
- ถ้า LINE API ล้มเหลว ให้ in-app notification และธุรกรรมหลักสำเร็จตามเดิม
- บันทึก error แบบไม่ใส่ token, secret หรือ payload ที่มีข้อมูลส่วนตัวเกินจำเป็น
- ใช้ emulator/unit tests ก่อน deploy Functions
- หลัง deploy ทดสอบด้วยบัญชี parent และ teacher แยกกัน: add friend, LIFF link, push, Rich Menu, booking, payment, attendance และ unlink
- เปิด feature flag หลังผ่าน smoke test; rollback ทำได้โดยปิด flag และหยุด dispatcher โดยไม่ต้องย้อนข้อมูล booking/payment

## Validation and acceptance criteria

1. ผู้ใช้ parent/teacher เพิ่ม OA แล้วเชื่อมบัญชีผ่าน LIFF ได้ และไม่สามารถผูกบัญชีอื่นแทนตัวเองได้
2. LINE user ที่ยังไม่ link ไม่ได้รับข้อความส่วนตัวและไม่ทำให้ transaction หลักล้มเหลว
3. Event เดียวกันส่ง LINE ไม่เกินหนึ่งครั้งต่อผู้รับ แม้ trigger ทำงานซ้ำ
4. ผู้ปกครองได้รับ booking/payment/attendance ตาม mapping
5. ครูได้รับ booking details, time/place, attendee count และ compensation ตาม mapping
6. Rich Menu แสดงตาม role และปุ่มนำทางได้
7. Webhook ที่ signature ผิดถูกปฏิเสธ
8. Tests ครอบคลุม token verification, signature, idempotency, retry, disabled config, missing link และ LINE API failure
9. `npm run typecheck`, Functions build และ targeted tests ผ่าน; `git diff --check` ผ่าน

## Out of scope

- การเปลี่ยน payment gateway หรือ escrow business rules
- การส่งข้อความ broadcast/การตลาด
- การสร้าง LINE OA account หรือออก Channel/LIFF credentials แทนผู้ใช้
- การส่งข้อมูล KYC หรือเอกสารส่วนตัวผ่าน LINE
- การเพิ่มบริการ queue ภายนอก เช่น Cloud Tasks, Pub/Sub หรือ Redis ใน phase แรก
