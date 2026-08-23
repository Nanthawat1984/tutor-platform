# TutorFinder — แพลตฟอร์มเรียนเสริมพิเศษ

แพลตฟอร์ม marketplace สำหรับครูเรียนเสริมในไทย ออกแบบสำหรับ workflow ของครู ผู้ปกครอง และผู้ดูแลระบบ

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Firebase / Google Cloud
- **Auth:** Firebase Authentication
- **Database:** Cloud Firestore
- **Storage:** Firebase Storage
- **Server runtime:** Firebase Admin SDK + Firebase Functions
- **Notifications:** LINE Messaging API + In-app
- **Payments:** Stripe Checkout (บัตร/PromptPay), โอน/สลิป + escrow/wallet + ใบเสร็จ/ประวัติชำระเงิน
  - โหมดทดสอบ (Mock Gateway) เปิดใช้งานโดยค่าเริ่มต้น — ตั้ง `PAYMENT_PROVIDER=stripe` และใช้ Stripe Test Mode เมื่อพร้อม
- **Locations & Maps:** ครูปักหมุดสถานที่สอน (`/locations`) ผ่าน Google Maps (Places Autocomplete + ลาก pin + GPS) — ผู้ปกครองค้นหาคอร์สใน `/explore` ได้จากแผนที่, "ค้นหาใกล้ฉัน" (เรียงตามระยะทาง), และกรองจังหวัด/เขต
  - ต้องตั้งค่า `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (เปิดใช้ Maps JavaScript API + Places API) — ถ้าไม่มี key ระบบยังใช้งานได้แบบกรอกที่อยู่ด้วยมือ (ไม่มีแผนที่)

## โครงสร้างโปรเจกต์

```text
tutor-platform/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, Register
│   │   ├── (teacher)/       # Teacher dashboard, courses, schedule, attendance
│   │   ├── (parent)/        # Parent dashboard, explore, bookings, progress
│   │   └── admin/           # Admin panel
│   ├── components/          # UI components
│   ├── hooks/               # Firebase auth/provider hooks
│   ├── lib/
│   │   ├── firebase/        # Firebase client/server configuration
│   │   ├── firestore/       # Firestore query helpers
│   │   └── line/            # LIFF linking and LINE notification helpers
│   └── types/               # Firestore and legacy database types
├── functions/               # Firebase Functions
├── firestore.rules          # Firestore security rules
├── firebase.json            # Firebase project config
└── public/                  # Static assets
```

## การติดตั้ง

```bash
# 1. Install dependencies (โปรเจกต์ใช้ pnpm)
pnpm install

# 2. Setup environment
cp .env.example .env.local

# 3. Fill Firebase client and admin values in .env.local
# Use Firebase project settings for NEXT_PUBLIC_FIREBASE_* values.
# Use a service account for FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.

# 4. Run dev server
pnpm dev
```

## Environment

Required Firebase values:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional local emulator flag:

- `FIREBASE_EMULATOR=true`

Google Maps (สำหรับฟีเจอร์สถานที่สอน/แผนที่):

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — เปิดใช้ Maps JavaScript API + Places API ใน Google Cloud Console และจำกัด key ด้วย HTTP referrers

## LINE OA + LIFF

ระบบเชื่อมกับ LINE Official Account `@966mqfzj` ผ่าน LIFF/Login ผู้ใช้ต้องเพิ่ม OA เป็นเพื่อนก่อน แล้วเข้าสู่หน้าโปรไฟล์ของ TutorPlatform เพื่อกด `เชื่อมต่อ LINE` ระบบจะตรวจ Firebase session และ LIFF ID token ฝั่ง server ก่อนบันทึก `lineUserId` ให้กับบัญชีของผู้ใช้เท่านั้น

ตัวแปรหลัก:

- `NEXT_PUBLIC_LINE_LIFF_ID` — LIFF ID สำหรับ browser
- `LINE_LOGIN_CHANNEL_ID` — Channel ID ของ LINE Login channel ที่สร้าง LIFF (แยกจาก Messaging API channel)
- `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` — ใช้เฉพาะฝั่ง server/Functions
- `LINE_OFFICIAL_ACCOUNT_ID=@966mqfzj`
- `LINE_NOTIFICATIONS_ENABLED=false` — เปิดหลัง smoke test เท่านั้น
- `LINE_RICH_MENU_DEFAULT_ID`, `LINE_RICH_MENU_PARENT_ID`, `LINE_RICH_MENU_TEACHER_ID` — ID ที่ได้จาก Rich Menu setup

การตั้งค่า LINE Developers:

1. สร้าง Messaging API channel และเปิดใช้ webhook
2. สร้าง LIFF app ใน channel เดียวกัน โดยตั้ง endpoint เป็น `NEXT_PUBLIC_APP_URL/my-profile`
3. ตั้ง webhook URL เป็น URL ของ Firebase Function `lineWebhook` ใน region `asia-southeast1`
4. ตั้งค่าความลับใน Functions configuration หรือ Secret Manager โดยไม่ใส่ลง client bundle เช่น `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN`
5. ตรวจสอบ local payload ก่อนสร้างเมนูจริง:

```bash
node scripts/build-line-rich-menu-assets.cjs
node scripts/setup-line-rich-menus.cjs --dry-run
```

6. เมื่อ payload และรูปภาพผ่านการตรวจแล้ว จึงรัน `node scripts/setup-line-rich-menus.cjs` ด้วย token จริง และนำ Rich Menu IDs ที่ได้ไปตั้งค่าใน Functions
7. ทดสอบ parent และ teacher แยกบัญชีกัน: add friend, LIFF link, Rich Menu, booking, payment, attendance และ compensation

การ rollback ที่ปลอดภัยคือปิด `LINE_NOTIFICATIONS_ENABLED` แล้ว deploy เฉพาะ Functions ใหม่ ระบบจอง/ชำระเงินและ in-app notification จะยังทำงานต่อ ส่วน outbox จะไม่ส่งข้อความใหม่จนกว่าจะเปิด flag กลับ

## Firestore Collections

- `users` — ข้อมูลผู้ใช้และ role
- `teacher_profiles` — ข้อมูลเฉพาะครู
- `subjects` — วิชาเรียน
- `courses` — คอร์สเรียน
- `bookings` — การจองเรียน
- `attendance` — การเข้าเรียน
- `session_reports` — ผลการเรียนหลังแต่ละเซสชัน
- `reviews` — รีวิวและ rating
- `notifications` — การแจ้งเตือน
- `lineNotificationOutbox` — คิวส่ง LINE แบบกันซ้ำและ retry ฝั่ง server เท่านั้น
- `payments` — สถานะการชำระเงิน (pending / paid / refunded / failed)
- `wallets` — กระเป๋าเงินครู (pendingBalance / availableBalance / totalEarned)
- `payouts` — ประวัติการโอนเงินให้ครู

## ระบบชำระเงิน

- **ช่องทางชำระเงิน:** Stripe Checkout (บัตร/PromptPay), โอนเงิน/สลิป
- **Flow:** จองเรียน → เลือกช่องทาง → ชำระเงิน → ยืนยันการจอง → ใบเสร็จ
- **Escrow:** เงินครูถูกเก็บใน `pendingBalance` จนกว่าเซสชันเรียนเสร็จ (เช็คชื่อ "มา") แล้วจึงปล่อยเข้า `availableBalance`
- **ค่าบริการแพลตฟอร์ม:** 20% ของรายได้ต่อเซสชัน (ดู `src/lib/payments/config.ts`)
- **Mock Gateway:** ทำงานเมื่อไม่มี Stripe key หรือ `PAYMENT_PROVIDER` ไม่ใช่ `stripe` — ไม่มีการหักเงินจริง
- **Stripe Test Mode:** ตั้ง `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` และตั้ง webhook ไปที่ `/api/payments/webhook`
- **ใบเสร็จ PDF:** ผู้ปกครองเปิด `/payments` แล้วกด `ดู / พิมพ์ใบเสร็จ PDF` ระบบใช้หน้าพิมพ์ของเบราว์เซอร์เพื่อเลือก `Save as PDF` โดยไม่เพิ่มค่า PDF service และไม่แสดงค่าบริการแพลตฟอร์มหรือรายได้ครู
- **Stripe Connect:** ครูเริ่ม onboarding ที่ `/profile/payout`; แอดมินยังเป็นผู้อนุมัติ payout และเลือก `ส่งผ่าน Stripe Connect` ได้เฉพาะบัญชีที่ Stripe แจ้งว่า transfers พร้อม
- **Connect safety flags:** `STRIPE_CONNECT_ENABLED=false` และ `STRIPE_CONNECT_LIVE_ENABLED=false` เป็นค่าเริ่มต้น ระบบจึงไม่สร้างบัญชีหรือโอนเงินจริงจนกว่าจะเปิดอย่างตั้งใจใน Test Mode ก่อน
- **อัปโหลดสลิป:** ผ่าน `/api/payments/upload-slip` (Admin SDK, ไม่พึ่ง client auth)

### UAT การชำระเงินและ Connect

ตรวจ contract และ regression ก่อนทดสอบด้วยบัญชีจริง/บัญชีทดสอบ:

```bash
node scripts/verify-receipt-connect.cjs
node scripts/verify-bank-transfer-review.cjs
node scripts/verify-stripe-payment.cjs
node scripts/verify-security-hardening.cjs
pnpm typecheck
pnpm build
```

ลำดับ UAT ที่ปลอดภัยคือใช้ Stripe Test Mode และสลิปทดสอบ: ผู้ปกครองส่งสลิป → ตรวจผล pre-check ใน Admin → Admin อนุมัติ/ปฏิเสธด้วยตนเอง → จบบทเรียน/ปล่อย escrow → ครูทำ Connect onboarding → Admin เลือก payout ผ่าน Connect เฉพาะเมื่อสถานะ transfers เป็น `active` การทดสอบ Live หรือการโอนเงินจริงยังต้องทำเป็น change แยกต่างหาก

## Roles

- `teacher` — ครูเรียนเสริม จัดการคอร์ส ตารางเรียน เช็คชื่อ และรายงานผล
- `parent` — ผู้ปกครอง ค้นหาครู จองเรียน และติดตามผลการเรียน
- `admin` — ผู้ดูแลระบบ ตรวจสอบครูและดูภาพรวมระบบ

## Validation

```bash
pnpm typecheck
pnpm build
```

## Local Firebase Emulator

Cloud Firestore ยังต้องถูกสร้างใน Firebase project จริงก่อนใช้ production database ได้ หากยังไม่มีสิทธิ์สร้าง Cloud Firestore ให้รันระบบบน local emulator ก่อน:

```bash
# Terminal 1
pnpm emulators

# Terminal 2
pnpm build
pnpm start
```

เปิดแอปที่ `http://localhost:3000` และเปิด Emulator UI ที่ `http://127.0.0.1:4000`
