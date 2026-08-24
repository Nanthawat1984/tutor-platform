# Teacher Schedule-Based Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน parent booking ให้เลือกเฉพาะ slot จากตารางครู และบังคับใช้กติกานี้ซ้ำใน server transaction

**Architecture:** เพิ่ม pure availability module สำหรับ normalize schedule เดิม, สร้าง slot ตาม course duration และตรวจ overlap; หน้า server-rendered booking จะโหลด slot ที่ว่างและส่งเพียง `schedule_slot` ที่เลือก; server action จะโหลดข้อมูลสดและตรวจ slot/conflict ใน Firestore transaction ก่อนสร้าง booking/payment ต่อด้วย flow เดิม

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin Firestore, Node built-in test runner, Firebase App Hosting

**Spec:** `docs/superpowers/specs/2026-08-24-teacher-schedule-booking.md`

## Global Constraints

- ใช้ตารางครูเป็น source of truth สำหรับวันและเวลา
- ห้ามเปิดช่องกรอกวันเวลาอิสระให้ parent
- ตรวจซ้ำฝั่ง server และไม่พึ่ง client validation
- รองรับ schedule เก่าที่ใช้ snake_case โดยไม่ต้อง migration แบบ destructive
- ไม่แตะ secrets, payment provider settings หรือไฟล์ untracked เดิม
- deploy เฉพาะ Firebase App Hosting backend `tutor-platform`

---

### Task 1: Availability domain helper

**Files:**
- Create: `src/lib/booking/availability.ts`
- Test: `src/lib/booking/availability.test.ts`

**Interfaces:**
- `buildAvailableBookingSlots(input): AvailableBookingSlot[]`
- `validateBookingSlot(input): BookingSlotValidation`

- [ ] **Step 1: Write failing tests**

Cover: recurring schedule slot generation, legacy date keys, course-duration slicing, pending/confirmed overlap exclusion, cancelled booking not blocking, and rejection of a slot outside the schedule.

- [ ] **Step 2: Run the tests and confirm the expected RED failure**

Run: `node --experimental-strip-types --test src/lib/booking/availability.test.ts`

Expected: FAIL because `src/lib/booking/availability.ts` does not exist yet.

- [ ] **Step 3: Implement the pure helper**

Normalize `startDate ?? start_date`, `endDate ?? end_date`, accept `HH:mm` and `HH:mm:ss`, use Bangkok calendar dates without UTC date drift, create 30-minute start increments that fit `durationMinutes`, and treat only `pending`/`confirmed` bookings as blocking.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `node --experimental-strip-types --test src/lib/booking/availability.test.ts`

Expected: all availability tests pass.

### Task 2: Parent booking UI

**Files:**
- Modify: `src/app/(parent)/bookings/new/page.tsx`
- Modify: `src/types/firestore.ts`

**Interfaces:**
- Page loads active course schedules and teacher bookings, calls `buildAvailableBookingSlots`, and renders a single `schedule_slot` select.
- Booking form sends `schedule_slot` as `<date>::<scheduleId>::<startTime>`; it does not accept arbitrary date/time fields.

- [ ] **Step 1: Add the page-level data loading and empty state**

Load active schedules for the course and pending/confirmed bookings for the teacher, generate the next 90 days of slots, and show a clear message with disabled submit when none exist.

- [ ] **Step 2: Replace free date/time inputs**

Render only the generated slot options and keep student/notes/payment flow unchanged.

- [ ] **Step 3: Update the Firestore `Schedule` type**

Document canonical `startDate`/`endDate` and optional legacy keys for read compatibility.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: no TypeScript errors.

### Task 3: Server-side enforcement and schedule write compatibility

**Files:**
- Modify: `src/app/(parent)/bookings/new/page.tsx`
- Modify: `src/app/(teacher)/schedule/new/page.tsx`
- Modify: `firestore.indexes.json` only if the verified query requires a new index

- [ ] **Step 1: Add a failing server validation test or pure validation coverage**

Assert that a submitted slot outside the teacher schedule is rejected and that overlapping pending/confirmed bookings are rejected.

- [ ] **Step 2: Validate live Firestore state in the action**

Re-read the course and referenced schedule, verify ownership and active/date/day/time/duration constraints, and query teacher bookings for the selected date.

- [ ] **Step 3: Create booking in a Firestore transaction**

Read schedule and conflicting bookings in the transaction, reject conflict, then create the booking with server-derived `bookingDate`, `startTime`, and `endTime`; create the payment record only after the booking transaction succeeds.

- [ ] **Step 4: Write canonical schedule date fields**

Save `startDate` and `endDate` while retaining read compatibility for existing snake_case records.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --experimental-strip-types --test src/lib/booking/availability.test.ts` and `npm run typecheck`.

### Task 4: Verification, commit, and deploy

**Files:**
- No unrelated files

- [ ] **Step 1: Review diff and worktree**

Run: `git diff --check`, `git status --short`, and inspect only in-scope changes.

- [ ] **Step 2: Run production build**

Run: `npm run build`.

- [ ] **Step 3: Commit the implementation**

Run: `git add src docs/superpowers/specs/2026-08-24-teacher-schedule-booking.md docs/superpowers/plans/2026-08-24-teacher-schedule-booking.md firestore.indexes.json; git commit -m "fix: enforce teacher schedule for bookings"`.

- [ ] **Step 4: Deploy the verified commit**

Use Firebase App Hosting backend `tutor-platform` in project `tutor-platform-4e38f`; do not use generic Hosting deployment.

- [ ] **Step 5: Verify production smoke routes and report runtime evidence separately**

Check `/`, `/tutors`, `/explore`, `/login`, `/robots.txt`, and `/sitemap.xml`; report code/build evidence separately from live runtime evidence.
