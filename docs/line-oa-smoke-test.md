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

หลังแก้ URL ของเมนูใน repo ให้เลือกวิธีตามชนิดของการแก้:

- **แก้เฉพาะ URI (ไม่แตะภาพ)** — รัน `node scripts/setup-line-rich-menus.cjs`
  ตรง ๆ สคริปต์จะ `PUT` อัปเดต definition ที่ ID เดิมใน env ทันที (ไม่ต้องลบ/สร้างเมนูใหม่)
- **แก้ข้อความ/ไอคอน (เปลี่ยนภาพเมนู)** — LINE ไม่อนุญาตอัปโหลดรูปทับเมนูที่มีรูปแล้ว
  (HTTP 400 `An image has already been uploaded`) ต้องหมุนเมนูใหม่ทั้งรอบ:
  `node scripts/build-line-rich-menu-assets.cjs` →
  `node scripts/setup-line-rich-menus.cjs --replace --reassign` →
  อัปเดต `LINE_RICH_MENU_*_ID` ใหม่ทั้ง `apphosting.yaml` และ `functions/.env`
  → deploy App Hosting (push) + `firebase deploy --only functions`
  → เก็บกวาดเมนูรอบเก่า: ตั้ง ID ปัจจุบันใน env แล้วรัน
  `node scripts/setup-line-rich-menus.cjs --prune` — ลบเฉพาะเมนูที่สคริปต์นี้สร้างเอง
  (ชื่อ `TutorPlatform *`) ที่ไม่ใช่ 3 ID ปัจจุบัน; ผู้ใช้ที่ยังผูกกับเมนูที่ถูกลบ
  จะ fallback ไป default menu เองโดย LINE ตัดลิงก์ให้

### ผลตรวจสอบ 6 ต.ค. 2026 — Endpoint URL ใน Console ยังไม่ได้ตั้งเป็น domain root

ตรวจได้จากภายนอกไม่ต้องใช้ token:

```bash
curl -s "https://liff.line.me/{liffId}/my-bookings" | grep liffFullUrlForBrowser
# ได้ https://tutorfinder.pilotai.space/my-profile?liff.state=%2Fmy-bookings
```

สองข้อเท็จจริงที่ได้จากผลตรวจนี้ (ยืนยันด้วย LIFF SDK 2.31.1 ในเครื่อง):

1. **Endpoint URL ยังเป็น `https://tutorfinder.pilotai.space/my-profile`** — LIFF จะพามา
   ที่หน้านี้ก่อน (primary redirect) ทุก tile ทุกเมนู จึงเห็นหน้า `/my-profile`
   (หน้าเชื่อมต่อ/โปรไฟล์) ทุกครั้งที่กด ส่วน path จริงที่ผู้ใช้กดถูกยัดไว้ใน
   `liff.state` แล้วทิ้งไว้เฉย ๆ
2. **การย้ายไปหน้าจริง (secondary redirect) เกิดเฉพาะตอนเรียก `liff.init()` เท่านั้น**
   โค้ดเดิมไม่มีใครเรียกที่ primary redirect → ผู้ใช้จึงค้างอยู่หน้า endpoint
   และถ้าเรียก init โดย endpoint ยังชี้ `/my-profile` LIFF จะต่อ path เข้าด้วยกัน
   ได้ `https://tutorfinder.pilotai.space/my-profile/my-bookings` (ไม่มีหน้านี้ → 404)
   ทดสอบจริงแล้ว: secondary redirect ที่ได้ตอนนี้คือ `/my-profile/{เมนูที่กด}`

แนวทางแก้ฝั่งโค้ด (ใช้งานแล้ว): **middleware อ่าน `liff.state` เองแล้ว redirect
ไปหน้าที่กดทันทีที่ฝั่ง server** (`getLiffStateRedirect` ใน `src/lib/line/liff-state.ts`)
จึงใช้ได้ไม่ว่า Endpoint ใน Console จะตั้งเป็นอะไร และไม่ปล่อยให้ LIFF SDK ต่อ path
เป็น `/my-profile/{เมนู}` (404) — เคสที่มี auth code ของ LINE ปะปน ให้
`LiffStateRedirect` (root layout) เรียก `liff.init()` แลกก่อนแล้วจึงย้ายหน้า
มีเทสต์ครอบ 5 เคส (รวม open redirect และ redirect วนซ้ำ)

ยังแนะนำให้ตั้ง **Endpoint URL = `https://tutorfinder.pilotai.space/`** ใน
LINE Developers Console ตามเอกสาร LINE (กันคำเตือน `liff.init()` ว่า URL ไม่อยู่
ใต้ endpoint) แต่เมนูไม่ได้ผูกกับการตั้งค่านี้อีกต่อไป

ตรวจซ้ำด้วยคำสั่งนี้ — ต้องชี้ไป `/payments` เสมอ:

```bash
curl -sI "https://tutorfinder.pilotai.space/my-profile?liff.state=%2Fpayments" | grep -i location
```

### รอบที่ 3 — 7 ต.ค. 2026: ช่อง "ตารางเรียน" → "แดชบอร์ด"

เปลี่ยน tile ที่เขียน "ตารางเรียน" เป็น "แดชบอร์ด" (ไอคอน grid) และลิงก์ชี้
`/dashboard` ทั้งเมนู default (ช่องกลางแถวล่าง, เดิม `/schedule`) และ parent
(ช่องที่สองแถวบน, เดิม `/my-bookings`) — เมนู teacher ใช้คำว่า "ตารางสอน" จึงคงเดิม
หน้า `/dashboard` เป็นแดชบอร์ดของครูและมี role guard: parent โดนเด้งไป
`/my-bookings`, admin ไป `/admin/dashboard` จึงปลอดภัยสำหรับทุก role
หมุนเมนูแล้ว verified ผ่าน LINE API (URIs + รูป byte-match) — ID ใหม่อยู่ใน
`apphosting.yaml` + `functions/.env` และเก็บกวาดเมนูรอบเก่าที่ค้าง 9 ชุดทิ้งด้วย
`--prune` (เหลือเฉพาะ 3 ชุดที่ใช้งานจริง)

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
