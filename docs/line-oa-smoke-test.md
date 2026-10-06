# LINE OA — สถานะการใช้งานและวิธีตรวจสอบ

**สถานะ: เปิดใช้งานแล้ว 1 ต.ค. 2026** (ผู้ใช้ตัดสินใจเปิด flag ก่อน external smoke test ครบ)

`LINE_NOTIFICATIONS_ENABLED=true` และ `NEXT_PUBLIC_LINE_NOTIFICATIONS_ENABLED=true`
ประกาศคู่กันใน `apphosting.yaml` — Cloud Functions เป็นฝั่งส่ง, ฝั่ง browser
เป็นฝั่งโชว์ปุ่มเชื่อมต่อ ถ้าสองตัวนี้ไม่ตรงกัน ผู้ใช้จะเจอปุ่มที่กดแล้วไม่ได้รับอะไร
`scripts/verify-line-oa.cjs` ตรวจเรื่องนี้ใน CI แล้ว

> **สิ่งที่ยังไม่ได้พิสูจน์:** ไม่เคยยิงข้อความจริงถึงปลายทางสักครั้ง
> รายการด้านล่างจึงยังต้องทำ ไม่ใช่เพราะเปิด flag ไม่ได้ แต่เพราะตอนนี้มัน
> ผลกระทบกับผู้ใช้จริงแล้ว ควรทีละข้อแล้วบันทึกผลกลับมาในไฟล์นี้

## LIFF browser context — กฎที่ทุกลิงก์จาก LINE ต้องทำตาม

ทุกลิงก์จาก LINE OA (Rich Menu ทุก tile + ข้อความต้อนรับ/ตอบกลับ) ต้องเปิดผ่าน LIFF
(`https://liff.line.me/{liffId}{path}`) เสมอ เพราะ webview ปกติของ LINE แยก cookie
ออกจาก LIFF browser (ชัดเจนบน iOS) — ถ้า tile ไหนใช้ URL ตรง ผู้ใช้ต้องเชื่อมต่อ/
login ใหม่ทุกครั้งที่กด (บั๊กที่เกิดจริง 5 ต.ค. 2026)

ข้อกำหนดที่ตั้งใน LINE Developers Console (LINE Login channel → LIFF):

- **Endpoint URL = `NEXT_PUBLIC_APP_URL` (domain root)** — path หลัง `liff.line.me`
  ต้องอยู่ใต้ endpoint URL ถ้า endpoint ชี้ที่ `/my-profile` path อื่น (เช่น `/my-bookings`)
  จะถูกเมินแล้วเปิด endpoint เดิมแทน

หลังแก้ URL ของเมนูใน repo ให้รัน `node scripts/setup-line-rich-menus.cjs`
— script จะ `PUT` อัปเดต definition ที่ ID เดิมใน env ทันที (ไม่ต้องลบ/สร้างเมนูใหม่)

## Rollback (ปิดกลับทันที)

แก้ทั้งสองตัวใน `apphosting.yaml` เป็น `"false"` แล้ว deploy — ใช้เวลาราว 3–5 นาที

ผลหลังปิด: ข้อความที่ค้างสถานะ `pending` จะถูก retry cron ส่งต่อเมื่อเปิดกลับ
ส่วนข้อความที่ตกเป็น `skipped` (เช่น ตอนผู้ใช้ยังไม่ได้เชื่อมบัญชี) **จะไม่ถูกส่งย้อนหลัง**
ต้อง trigger เหตุการณ์นั้นใหม่จึงจะเข้า outbox อีกครั้ง

## การทดสอบที่ยังต้องทำ (เรียงตามความเสี่ยง)

ทำด้วยบัญชีทดสอบ ไม่ใช้บัญชีจริง — และอย่าใช้บัญชีที่มีข้อมูล KYC/การเงินจริง

1. เพิ่มเพื่อน OA `@966mqfzj` → ต้องได้ข้อความต้อนรับ + ปุ่ม "เชื่อมต่อบัญชี"
2. กดปุ่ม → เปิด LIFF → login → กลับมา `/my-profile` แล้วเชื่อมสำเร็จ
3. Rich Menu ของ parent กับ teacher ต้องต่างกันจริง
4. สร้าง booking → ครูได้รับ `booking.created`
5. booking → confirmed → ทั้งสองฝั่งได้รับ `booking.confirmed`
6. ชำระเงิน → `payment.pending` และ `payment.paid`
7. เปลี่ยน attendance → `attendance.changed`
8. ปล่อย escrow → ครูได้รับ `payment.released`
9. เลื่อนเวลาเรียนจากในแอป → อีกฝ่ายได้รับ `booking.rescheduled`
10. ยิง trigger ซ้ำ → ต้องไม่มีข้อความซ้ำ (doc ID แบบ deterministic)
11. ส่ง webhook ด้วยลายเซ็นผิด → ต้องได้ 401
12. ผู้ใช้ที่ยังไม่เชื่อม → ไม่ error, outbox เป็น `skipped` ด้วย `line_user_not_linked`
13. สั่ง LINE API ล้มเหลวจำลอง → ธุรกรรมหลักยังสำเร็จ, outbox เป็น `failed` แล้ว retry

## ตรวจสถานะใน Firestore (named database `tutor`)

- `lineNotificationOutbox` — ดู `status` เป็น `sent` / `skipped` / `failed`
  ถ้า `failed` เยอะ ฟังก์ชัน `opsAlertMonitor` จะเตือนแอดมินเมื่อครบ 10 รายการ
- `users/{uid}` — `lineUserId`, `lineLinkedAt`, `lineNotificationEnabled`

## Local validation (รันซ้ำได้ทุกครั้งก่อน commit)

- `node scripts/verify-line-link.cjs` / `verify-line-webhook.cjs` / `verify-line-oa.cjs` — ทั้งสามอยู่ใน CI
- `cd functions && npm test` — 15 tests ครอบ signature, outbox id, retry/backoff, retry cap
- `pnpm typecheck` และ `pnpm build`
- `node scripts/setup-line-rich-menus.cjs --dry-run` — ไม่ยิงเน็ต

## ค่าที่ตั้งไว้

| รายการ | ค่า |
| --- | --- |
| OA Basic ID | `@966mqfzj` |
| LIFF ID | `2011204493-x3Zg7Ksl` |
| LIFF endpoint | `https://tutorfinder.pilotai.space/` (domain root — ตั้งใน Console) |
| Channel ID | `2011204232` |
| Rich Menu (default/parent/teacher) | มี ID จริงทั้งสามชุดใน `apphosting.yaml` |

secret (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`) อยู่ใน Secret Manager
และผูกกับ service account ของ App Hosting + Functions แล้ว ห้ามเขียนลงไฟล์หรือ log
