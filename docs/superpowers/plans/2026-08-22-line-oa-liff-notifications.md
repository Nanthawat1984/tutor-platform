# LINE OA + LIFF Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เชื่อมบัญชี parent/teacher กับ LINE OA `@966mqfzj` ผ่าน LIFF/Login และส่ง booking, payment, attendance และ compensation notifications แบบปลอดภัย กันซ้ำ และไม่ทำให้ธุรกรรมหลักล้มเหลว

**Architecture:** Next.js จัดการ LIFF link/unlink ส่วน Firebase Functions จัดการ LINE webhook, event mapping, outbox dispatcher และ Rich Menu API Event จะเขียนลง `lineNotificationOutbox` ด้วย deterministic ID จาก event/ผู้รับ/entity เพื่อกันการส่งซ้ำจาก trigger ที่ retry ได้ In-app notification และ booking/payment ยังคง authoritative

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Firebase Auth, Firestore database `tutor`, Firebase Cloud Functions v1/Node 20, LINE Messaging API, LIFF SDK, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-08-22-line-oa-liff-notifications-design.md`

## Global Constraints

- ใช้ official LINE APIs ผ่าน Firebase Functions; ไม่มี LINE OA MCP plugin ที่ติดตั้งใช้งานได้ใน workspace นี้
- ผู้ใช้ต้องเพิ่ม OA `@966mqfzj` เป็นเพื่อนก่อนจึงจะรับ push message เฉพาะบุคคลได้
- ห้ามรับ `lineUserId` จาก client เป็นข้อมูลที่เชื่อถือได้ และห้ามเก็บ LIFF access token หรือ ID token ลง Firestore
- Secret อยู่ใน server/Functions configuration เท่านั้น; token/secret ห้ามส่งเข้า browser หรือ log
- ถ้า LINE API ล้มเหลว ให้ in-app notification และธุรกรรมหลักสำเร็จตามเดิม
- Firestore rules ต้องป้องกัน client เขียน LINE identity และ outbox โดยตรง
- ห้าม reset/checkout/stage หรือทับไฟล์ dirty ที่ไม่เกี่ยวข้อง
- `LINE_NOTIFICATIONS_ENABLED=false` เป็นค่าเริ่มต้นจนกว่าจะผ่าน smoke test
- ห้ามเปลี่ยน payment gateway หรือ escrow business rules

---

### Task 1: Configuration, types, and test harness

**Files:**
- Create: `src/lib/line/config.ts`, `src/types/line.ts`
- Modify: `src/types/firestore.ts`, `.env.example`, `package.json`, `pnpm-lock.yaml`, `functions/package.json`
- Create: `functions/src/line/config.ts`, `functions/src/line/types.ts`, `functions/test/config.test.cjs`

**Interfaces:**
- `getLineClientConfig(): { enabled: boolean; officialAccountId: string; liffId: string }` is safe for browser use.
- `getLineServerConfig(): { enabled: boolean; channelId: string; channelSecret: string; channelAccessToken: string; appUrl: string }` is server-only.
- `LineNotificationEvent` is the union `booking.created | booking.confirmed | booking.cancelled | payment.pending | payment.paid | attendance.changed | payment.released`.
- `LineNotificationOutbox` has `recipientUid`, `lineUserId`, `eventType`, `entityId`, `messages`, `status`, `attempts`, `lastError`, `nextAttemptAt`, `createdAt`, `updatedAt`, and optional `sentAt`.

- [ ] **Step 1: Add configuration placeholders**

Add these names to `.env.example` without real values:

```text
NEXT_PUBLIC_LINE_LIFF_ID=your-liff-id
LINE_CHANNEL_ID=your-line-channel-id
LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
LINE_OFFICIAL_ACCOUNT_ID=@966mqfzj
LINE_NOTIFICATIONS_ENABLED=false
```

- [ ] **Step 2: Add the official LIFF package**

Run `pnpm add @line/liff` from the repository root. Do not add a queue, ORM, or HTTP client; Functions targets Node 20 and already has native `fetch`.

- [ ] **Step 3: Implement config and Firestore types**

Keep `NEXT_PUBLIC_LINE_LIFF_ID` in browser config only. Server config must read token, secret, channel ID, feature flag, and app URL from server environment. Add optional `lineUserId`, `lineLinkedAt`, and `lineNotificationEnabled` to `User`.

Add the Functions test script exactly as `"test": "npm run build && node --test test"` so later validation runs the compiled test suite consistently.

- [ ] **Step 4: Add and run the first test**

`functions/test/config.test.cjs` must assert disabled mode does not require credentials, enabled mode without a channel secret raises a named configuration error, and the default OA ID is `@966mqfzj`.

Run `cd functions; npm run build; node --test test/config.test.cjs`. Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add src/lib/line/config.ts src/types/line.ts src/types/firestore.ts .env.example package.json pnpm-lock.yaml functions/package.json functions/src/line/config.ts functions/src/line/types.ts functions/test/config.test.cjs
git commit -m "feat: add LINE OA configuration types"
```

---

### Task 2: LIFF identity link/unlink and UI

**Files:**
- Create: `src/lib/line/liff.ts`, `src/app/api/line/link/route.ts`, `src/app/api/line/unlink/route.ts`, `src/components/line/line-link-card.tsx`, `scripts/verify-line-link.cjs`
- Modify: `src/app/(parent)/my-profile/page.tsx`, `src/app/(teacher)/profile/edit/page.tsx`

**Interfaces:**
- `POST /api/line/link` accepts `{ idToken: string }` plus Firebase bearer auth and returns `{ linked: true, lineUserIdMasked: string }`.
- `POST /api/line/unlink` uses Firebase bearer auth and returns `{ linked: false }`.
- `verifyLineIdToken(idToken: string): Promise<{ lineUserId: string; channelId: string }>` verifies against LINE’s token endpoint.

- [ ] **Step 1: Write the route contract check**

`scripts/verify-line-link.cjs` must fail if the route accepts/stores a client `lineUserId`, omits Firebase auth, or omits LINE token verification. Run it before implementation and record the expected failure.

- [ ] **Step 2: Implement server-side LIFF verification**

In `src/lib/line/liff.ts`, POST URL-encoded `id_token` and configured `client_id` to `https://api.line.me/oauth2/v2.1/verify`. Reject non-2xx, missing `sub`, wrong channel, and expired tokens. Return only the verified LINE user ID and channel ID.

- [ ] **Step 3: Implement link route**

Use existing `getServerAuth()`, `getServerDb()`, and `COLLECTIONS.USERS`. Verify Firebase bearer token, validate `idToken` as a string max 4096 chars, verify it with LINE, query for an existing matching `lineUserId`, return 409 if another UID owns it, then update only the authenticated user with `lineUserId`, `lineLinkedAt`, `lineNotificationEnabled: true`, and `updatedAt`.

- [ ] **Step 4: Implement unlink route**

Verify Firebase auth and update only the authenticated user with `FieldValue.delete()` for `lineUserId` and `lineLinkedAt`, `lineNotificationEnabled: false`, and `updatedAt`. Keep outbox history for auditability.

- [ ] **Step 5: Build the client card**

Call `liff.init({ liffId })`, `liff.login()` when needed, and `liff.getIDToken()`. POST the ID token with the existing Firebase ID token. Render not-linked, linking, linked, and error states. Include add-friend URL `https://line.me/R/ti/p/%40966mqfzj` and unlink action.

- [ ] **Step 6: Mount in both profiles and validate**

Mount the shared card in parent `my-profile` and teacher `profile/edit` using `user.lineUserId`; do not duplicate link logic or alter KYC/payout fields. Run `node scripts/verify-line-link.cjs` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```text
git add src/lib/line/liff.ts src/app/api/line/link/route.ts src/app/api/line/unlink/route.ts src/components/line/line-link-card.tsx src/app/(parent)/my-profile/page.tsx src/app/(teacher)/profile/edit/page.tsx scripts/verify-line-link.cjs
git commit -m "feat: link user accounts with LINE LIFF"
```

---

### Task 3: Messaging client, templates, idempotent outbox, and retry

**Files:**
- Create: `functions/src/line/client.ts`, `functions/src/line/security.ts`, `functions/src/line/messages.ts`, `functions/src/line/outbox.ts`
- Modify: `functions/src/index.ts`, `functions/package.json`
- Create: `functions/test/line-security.test.cjs`, `functions/test/line-outbox.test.cjs`

**Interfaces:**
- `verifyLineWebhookSignature(rawBody: Buffer|string, signature: string, channelSecret: string): boolean`
- `pushLineMessages(lineUserId: string, messages: Array<Record<string, unknown>>): Promise<void>`
- `createLineOutbox(db, input): Promise<'created'|'existing'|'skipped'>`
- `dispatchLineOutbox(docId: string): Promise<'sent'|'retry'|'skipped'>`

- [ ] **Step 1: Write failing security/idempotency tests**

Test valid/changed-body/changed-signature HMAC cases. Test that `recipientUid + eventType + entityId` produces one deterministic ID and a second create returns `existing`.

- [ ] **Step 2: Implement HMAC verification**

Use `crypto.createHmac('sha256', secret).update(rawBody).digest('base64')` and `timingSafeEqual`; return false for missing or invalid-length signatures and never log inputs.

- [ ] **Step 3: Implement Messaging API push**

POST to `https://api.line.me/v2/bot/message/push` with bearer token and `{ to: lineUserId, messages }`. Treat 2xx as success, permanent user-invalid responses as skip, and transient 5xx/network errors as retryable. Errors contain only status/code.

- [ ] **Step 4: Implement Thai message templates**

Create builders for booking, payment, attendance, and release events. Format THB with `toLocaleString('th-TH')`, show safe location fallback, and never include KYC, bank account, ID-card, token, or secret data.

- [ ] **Step 5: Implement outbox creation**

Hash `eventType:entityId:recipientUid` with SHA-256 for the Firestore document ID. In a transaction, read `users/{recipientUid}`; create `skipped` when no `lineUserId` or notification is disabled, otherwise create `pending` with the minimal message payload.

- [ ] **Step 6: Implement dispatch and retry**

Claim pending/failed records transactionally, set `sending`, increment attempts, send, then set `sent`/`sentAt`. Retry transient failures with exponential backoff, set `lastError` and `nextAttemptAt`, and cap at five attempts. Permanent user errors become `skipped`.

- [ ] **Step 7: Test and commit**

Run `cd functions; npm run build; node --test test/line-security.test.cjs test/line-outbox.test.cjs`. Expected: PASS for signature, disabled config, deterministic ID, retry cap, and permanent skip.

```text
git add functions/src/line functions/src/index.ts functions/test/line-security.test.cjs functions/test/line-outbox.test.cjs functions/package.json
git commit -m "feat: add reliable LINE notification delivery"
```

---

### Task 4: Booking, payment, attendance, and compensation event mapping

**Files:**
- Modify: `functions/src/index.ts`, `src/app/(parent)/bookings/new/page.tsx`, `src/app/(teacher)/attendance/page.tsx`, `src/lib/payments/process.ts`
- Create: `functions/test/notification-events.test.cjs`

**Interfaces:**
- `enqueueBookingCreated(bookingId, booking)` targets `booking.teacherId`.
- `enqueueBookingStatusChanged(bookingId, before, after)` targets parent/teacher only when status changes.
- `enqueuePaymentChanged(paymentId, before, after, booking)` targets parent for pending/paid and teacher for paid compensation.
- `enqueueAttendanceChanged(attendanceId, before, after, booking)` targets the booking parent only when status changes.
- `enqueuePaymentReleased(bookingId, payment)` targets the teacher once.

- [ ] **Step 1: Write event matrix tests**

Assert recipients for each event, no event for unchanged status, and teacher booking messages containing date, time, location, attendee count, and net compensation when present.

- [ ] **Step 2: Add booking-created trigger**

Add `onBookingCreated` for `bookings/{bookingId}`. Resolve course/center location when absent, calculate same-course/date attendee count, and enqueue teacher `booking.created` without changing booking/payment state.

- [ ] **Step 3: Refactor status trigger to outbox**

Keep existing in-app notifications and escrow behavior. Enqueue `booking.confirmed` and `booking.cancelled` through deterministic IDs; keep completed as an in-app state and use `payment.released` for the teacher compensation notification. Do not call LINE directly from a transaction.

- [ ] **Step 4: Add payment pending/paid mapping**

Use payment `onCreate` for `payment.pending` and the existing status update path for `payment.paid`. Preserve `escrowProcessed`; duplicate execution must produce `existing`, not a second event.

- [ ] **Step 5: Make attendance status-aware**

Handle attendance create/update, read booking `parentId`, and enqueue only when effective status changes. If the UI continues adding records, key by `bookingId + sessionDate + status` so repeated clicks do not spam LINE.

- [ ] **Step 6: Add release event without changing wallet math**

After existing escrow release calculates `payoutAmount`/`netAmount`, enqueue teacher `payment.released`. Keep tax and wallet arithmetic untouched.

- [ ] **Step 7: Test and commit**

Run `cd functions; npm run build; node --test test/notification-events.test.cjs`. Expected: correct role routing and no duplicate outbox event on repeated triggers.

```text
git add functions/src/index.ts src/app/(parent)/bookings/new/page.tsx src/app/(teacher)/attendance/page.tsx src/lib/payments/process.ts functions/test/notification-events.test.cjs
git commit -m "feat: enqueue LINE notifications from booking events"
```

---

### Task 5: Secure webhook, onboarding, Rich Menu assets, and setup script

**Files:**
- Modify: `functions/src/index.ts`, `.env.example`
- Create: `functions/src/line/rich-menu.ts`, `scripts/setup-line-rich-menus.cjs`, `scripts/verify-line-webhook.cjs`
- Create: `public/line/rich-menu-default.png`, `public/line/rich-menu-parent.png`, `public/line/rich-menu-teacher.png`

**Interfaces:**
- `handleLineWebhook(rawBody: Buffer, signature: string): Promise<void>` verifies before parsing.
- `createRoleRichMenu(role: 'default'|'parent'|'teacher'): Promise<string>` returns a LINE menu ID.
- `assignRoleRichMenu(lineUserId: string, role: 'parent'|'teacher'): Promise<void>` assigns the menu after link.

- [ ] **Step 1: Create and verify cartoon assets**

Create three mobile-readable PNG menus with a consistent pink/purple/blue cartoon classroom theme. Use the six labels from the spec for each role, verify dimensions, and do not include private data or secrets in the images.

- [ ] **Step 2: Harden webhook**

Use Firebase `req.rawBody` and `x-line-signature`; return 401 for invalid signatures and 405 for non-POST. Parse/queue only after verification and respond quickly.

- [ ] **Step 3: Implement follow and postback behavior**

For `follow`, reply with welcome text, OA identity, add/link instructions, and LIFF button. Handle `ช่วยเหลือ`, `จอง`, and `เชื่อมบัญชี`; unknown text returns help. Postbacks return short confirmation or a web URL. Never query private data without linked identity.

- [ ] **Step 4: Implement Rich Menu API script**

`scripts/setup-line-rich-menus.cjs` must validate token/app URL/images before mutation, support `--dry-run`, create/upload/link default/parent/teacher menus, and print only returned menu IDs. Assign the role menu after successful LIFF link; a menu failure must not undo a successful link.

- [ ] **Step 5: Verify and commit**

Run `node scripts/verify-line-webhook.cjs; node scripts/setup-line-rich-menus.cjs --dry-run`. Expected: bad signatures are rejected and dry-run performs no network mutation.

```text
git add functions/src/index.ts functions/src/line/rich-menu.ts scripts/setup-line-rich-menus.cjs scripts/verify-line-webhook.cjs public/line .env.example
git commit -m "feat: add secure LINE webhook and role menus"
```

---

### Task 6: Firestore rules, docs, full validation, and staged smoke test

**Files:**
- Modify: `firestore.rules`, `firestore.indexes.json`, `README.md`, `.agent/state.md`
- Create: `scripts/verify-line-oa.cjs`, `docs/line-oa-smoke-test.md`

- [ ] **Step 1: Lock data boundaries**

Update the `/users/{uid}` rule so owner updates cannot affect `lineUserId`, `lineLinkedAt`, or `lineNotificationEnabled`; Admin SDK remains allowed. Add `/lineNotificationOutbox/{id}` with no client read/write. Add only the `status + nextAttemptAt` index if the dispatcher query needs it.

- [ ] **Step 2: Document setup and rollback**

Document LINE Developers channel/LIFF setup, endpoint/webhook URLs, server secret configuration, OA add-friend link, Rich Menu dry-run/upload, emulator tests, feature-flag enablement, and rollback by setting `LINE_NOTIFICATIONS_ENABLED=false`.

- [ ] **Step 3: Add static integration checks**

`scripts/verify-line-oa.cjs` must assert link/unlink routes, token/signature verification, deterministic outbox key, disabled default flag, no client token use, and rules denying outbox writes.

- [ ] **Step 4: Run local validation**

Run:

```text
node scripts/verify-line-link.cjs
node scripts/verify-line-webhook.cjs
node scripts/verify-line-oa.cjs
npm run typecheck
cd functions
npm run build
node --test test/*.test.cjs
cd ..
git diff --check
```

Expected: every local check passes. Missing external credentials may block only real LINE smoke tests, not security/idempotency tests.

- [ ] **Step 5: Run staged smoke test**

Use separate parent/teacher test accounts to add OA, link via LIFF, verify role menu, create booking, complete payment, change attendance, release escrow, test duplicate triggers, invalid signature, disabled flag, missing link, and simulated LINE failure. Confirm core transactions still succeed and no secrets appear in logs.

- [ ] **Step 6: Record evidence and enable**

Write sanitized timestamps, roles, event names, results, and safe error codes to `docs/line-oa-smoke-test.md`. Only after all acceptance criteria pass, enable the production flag. Update `.agent/state.md` with commands and results.

- [ ] **Step 7: Commit rules/docs/evidence**

```text
git add firestore.rules firestore.indexes.json README.md scripts/verify-line-oa.cjs docs/line-oa-smoke-test.md .agent/state.md
git commit -m "docs: document LINE OA setup and validation"
```

## Final acceptance criteria

- Parent and teacher can link/unlink through LIFF with server-side token verification.
- One LINE user cannot be linked to two Firebase accounts.
- Client cannot write LINE identity or outbox documents.
- Booking, payment, attendance, and compensation events reach the correct role.
- Duplicate trigger execution sends at most one message per recipient/event/entity.
- Webhook rejects invalid signatures and safe commands never expose private data.
- Default, parent, and teacher Rich Menus exist and are mobile-readable/cute cartoon style.
- LINE failure never rolls back booking/payment/escrow.
- Root typecheck, Functions build/tests, verification scripts, and `git diff --check` pass.
