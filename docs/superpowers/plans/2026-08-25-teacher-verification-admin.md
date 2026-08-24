# Teacher Verification Admin Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยก email verification ออกจาก Admin approval และเพิ่ม Admin review, KYC document viewing, search/filter และ audit history สำหรับครู

**Architecture:** ใช้ pure helper กลางสำหรับตีความสถานะครู, เก็บ fields ใหม่แบบ additive ใน `users`, และใช้ server-side Admin actions/routes สำหรับ mutation กับ KYC documents. Legacy `full` records ยัง approved ได้ ส่วน `basic` จะ pending.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin SDK, Firestore named database `tutor`, Firebase Storage signed URLs, Node built-in tests.

**Spec:** `docs/superpowers/specs/2026-08-25-teacher-verification-admin-design.md`

## Global Constraints

- ห้ามให้ email verification กลายเป็น teacher approval
- KYC documents ต้องเปิดได้เฉพาะ Admin ผ่าน server-side route และ signed URL อายุสั้น
- approve ต้องตรวจว่ามี `idCardURL` และ `bookBankURL` ก่อน
- reject ต้อง reset `isVerified=false` และบันทึกเหตุผล
- preserve existing `full` approved teachers และไฟล์ untracked
- ห้าม expose secrets, raw KYC URLs หรือ document contents ใน logs

---

### Task 1: Verification state helper and regression tests

**Files:**
- Create: `src/lib/auth/teacher-verification.ts`
- Test: `src/lib/auth/teacher-verification.test.ts`
- Modify: `src/types/firestore.ts`

**Interfaces:**
- `deriveAdminReviewStatus(user): 'pending' | 'approved' | 'rejected'`
- `isTeacherAdminApproved(user): boolean`
- `buildNewTeacherVerificationState(emailVerified): object`
- `storagePathFromDownloadUrl(value): string | null`

- [ ] **Step 1: Write failing tests** for basic email verification being pending, full approval being approved, rejected state not trusted, new teacher state, and extracting only `kyc/{uid}/...` storage paths.
- [ ] **Step 2: Run `node --test --import tsx src/lib/auth/teacher-verification.test.ts` and verify the new tests fail for the missing helper.
- [ ] **Step 3: Implement the pure helper and add optional User fields `emailVerified`, `adminReviewStatus`, `adminReviewedAt`, `adminReviewedBy`, `adminReviewNote` plus `TEACHER_VERIFICATION_EVENTS` collection constant.
- [ ] **Step 4: Run the focused test again and verify all cases pass.

### Task 2: Separate signup semantics and Admin list filtering

**Files:**
- Modify: `src/app/api/auth/profile/route.ts`
- Modify: `src/app/admin/teachers/page.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `firestore.rules`

- [ ] **Step 1: Add a regression assertion through the helper tests that a new teacher with verified email has `isVerified=false`, `verificationLevel=basic`, and `adminReviewStatus=pending`.
- [ ] **Step 2: Update profile creation to persist `emailVerified` separately and use the new teacher state; preserve parent email verification behavior.
- [ ] **Step 3: Filter Admin teachers by derived/new Admin review status, include UID in the search haystack, add review/KYC filters, and replace direct list actions with a detail link.
- [ ] **Step 4: Rename badge copy so `basic` clearly means email verified, not Admin approved.
- [ ] **Step 5: Add server-only Firestore event read/write rules for `teacherVerificationEvents`.
- [ ] **Step 6: Run focused tests and `npm run typecheck`.

### Task 3: Secure KYC document viewer

**Files:**
- Create: `src/app/api/admin/teachers/[id]/documents/[kind]/route.ts`
- Modify: `src/app/admin/teachers/[id]/page.tsx`

- [ ] **Step 1: Add tests for accepted document kinds and rejecting URLs outside `kyc/{teacherId}/`.
- [ ] **Step 2: Implement a Node route with Admin session/role guard, teacher lookup, legacy URL path parsing, Storage existence check, and 15-minute signed redirect.
- [ ] **Step 3: Add a KYC section that shows document presence/missing state and links only to the protected route.
- [ ] **Step 4: Run focused tests and `npm run typecheck`.

### Task 4: Admin detail, review actions, and audit history

**Files:**
- Modify: `src/app/admin/teachers/[id]/page.tsx`
- Modify: `src/types/firestore.ts`

- [ ] **Step 1: Add a failing test for approve rejecting incomplete KYC and reject clearing public verification.
- [ ] **Step 2: Add server actions guarded by `requireAdmin()`; approve requires both KYC links, writes approved/full/verified fields, and reject writes rejected/basic-or-none/unverified fields with note.
- [ ] **Step 3: Write a `teacherVerificationEvents` event in the same Firestore batch and load/sort the teacher’s history for the detail timeline.
- [ ] **Step 4: Add account, consent, KYC, review, profile, course, booking, payment and masked payout details to the Admin detail page.
- [ ] **Step 5: Run focused tests and `npm run typecheck`.

### Task 5: Targeted Production data repair

**Files:**
- Create: `scripts/repair-teacher-verification.cjs`

- [ ] **Step 1: Implement a dry-run-by-default script that finds one explicit email in named Firestore database `tutor`, prints only status fields, and requires `--apply` for mutation.
- [ ] **Step 2: Run dry-run for `twodmattie@gmail.com` and verify the target is the expected teacher record.
- [ ] **Step 3: Run `--apply` for that exact email, setting pending/unverified fields without deleting documents.
- [ ] **Step 4: Re-read the record and verify `isVerified=false`, `verificationLevel=basic`, `adminReviewStatus=pending`, and `kycStatus=none`.

### Task 6: Full validation and handoff

**Files:**
- No unrelated files; review all modified files and preserve existing untracked files.

- [ ] **Step 1: Run all focused Node tests and existing regression tests.**
- [ ] **Step 2: Run `npm run typecheck` and `npm run build`.
- [ ] **Step 3: Run `git diff --check`, inspect `git status --short`, and confirm no secrets or raw document URLs were added.
- [ ] **Step 4: If all checks pass, update `.agent/state.md` with the implementation, validation, deployment gate, and remaining production UAT requirements.
