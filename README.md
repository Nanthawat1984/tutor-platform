# TutorFinder — แพลตฟอร์มเรียนเสริมพิเศษ

แพลตฟอร์ม marketplace สำหรับครูเรียนเรียนเสริมในไทย — teacher-centric design

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime)
- **Payments:** Omise / 2C2P (PromptPay, Credit Card, TrueMoney)
- **Notifications:** LINE Messaging API + In-app

## โครงสร้างโปรเจกต์

```
tutor-platform/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, Register
│   │   ├── (teacher)/       # Teacher dashboard, courses, schedule, attendance
│   │   ├── (parent)/        # Parent dashboard, explore, bookings, progress
│   │   ├── admin/           # Admin panel
│   │   └── api/             # API routes (auth callback, payment webhook)
│   ├── components/          # UI components
│   ├── lib/supabase/        # Supabase client (browser + server)
│   ├── types/               # TypeScript types (database.ts)
│   └── hooks/               # Custom React hooks
├── supabase/
│   ├── migrations/          # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   └── 002_rls_policies.sql
│   └── seed/                # Seed data
└── public/                  # Static assets
```

## การติดตั้ง

```bash
# 1. Clone & install
npm install

# 2. Setup environment
cp .env.example .env.local
# แก้ไขค่า Supabase URL + keys

# 3. Setup Supabase
supabase init
supabase link --project-ref your-project-ref
supabase db push          # รัน migrations
supabase db seed          # รัน seed data

# 4. Run dev server
npm run dev
```

## Database Schema

### Core Tables (Phase 1 MVP)
- `profiles` — ข้อมูลผู้ใช้ทุกคน (extends auth.users)
- `teacher_profiles` — ข้อมูลเฉพาะครู (bio, rating, experience)
- `centers` — สถานที่สอน (รองรับ online + offline)
- `subjects` — วิชา (คณิต, วิทย์, ภาษาอังกฤษ, TGAT, etc.)
- `courses` — คอร์สเรียน (ราคา, ระดับ, รูปแบบ)
- `schedules` — ตารางสอน (recurring + one-off)
- `bookings` — การจองเรียน
- `attendance` — การเข้าเรียน
- `session_reports` — ผลการเรียนหลังแต่ละเซสชัน
- `reviews` — รีวิว + rating
- `payments` — การชำระเงิน
- `notifications` — การแจ้งเตือน

### Roles
- `teacher` — ครูเรียนเสริม (สร้างคอร์ส, จัดการตาราง, เช็คชื่อ, เขียน report)
- `parent` — ผู้ปกครอง (ค้นหาครู, จอง, จ่ายเงิน, ดูผลการเรียน)
- `admin` — ผู้ดูแลระบบ (approve ครู, moderate, ดู analytics)

## MVP Scope (Phase 1)

| โมดูล | Status |
|-------|--------|
| M1: Teacher Onboarding & Verification | ✅ Schema + Auth |
| M2: Teacher Profile | ✅ Schema + Page |
| M3: Course & Subject Catalog | ✅ Schema + Seed |
| M4: Scheduling | ✅ Schema |
| M5: Booking & Enrollment | ✅ Schema + Page |
| M6: Payment (PromptPay) | 🔄 Schema ready, gateway Phase 2 |
| M7: Attendance Tracking | ✅ Schema + Page |
| M8: Session Reports | ✅ Schema |

## Roadmap

- **Phase 1 (MVP):** Core booking flow, teacher management, attendance
- **Phase 2:** Payment integration, LINE notifications, reviews, analytics
- **Phase 3:** AI lesson planner, gamification, mobile app, referral system
