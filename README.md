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
- **Payments:** Omise / 2C2P planned for Phase 2

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
│   │   └── line.ts          # LINE notification helper
│   └── types/               # Firestore and legacy database types
├── functions/               # Firebase Functions
├── firestore.rules          # Firestore security rules
├── firebase.json            # Firebase project config
└── public/                  # Static assets
```

## การติดตั้ง

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env.local

# 3. Fill Firebase client and admin values in .env.local
# Use Firebase project settings for NEXT_PUBLIC_FIREBASE_* values.
# Use a service account for FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.

# 4. Run dev server
npm run dev
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
- `payments` — สถานะการชำระเงิน

## Roles

- `teacher` — ครูเรียนเสริม จัดการคอร์ส ตารางเรียน เช็คชื่อ และรายงานผล
- `parent` — ผู้ปกครอง ค้นหาครู จองเรียน และติดตามผลการเรียน
- `admin` — ผู้ดูแลระบบ ตรวจสอบครูและดูภาพรวมระบบ

## Validation

```bash
npm run typecheck
npm run build
```

## Local Firebase Emulator

Cloud Firestore ยังต้องถูกสร้างใน Firebase project จริงก่อนใช้ production database ได้ หากยังไม่มีสิทธิ์สร้าง Cloud Firestore ให้รันระบบบน local emulator ก่อน:

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run build
npm run start
```

เปิดแอปที่ `http://localhost:3000` และเปิด Emulator UI ที่ `http://127.0.0.1:4000`
