# Teacher Verification and Admin Review Design

## Goal

แยกการยืนยันอีเมลออกจากการอนุมัติครูโดย Admin, ทำให้ครูใหม่ไม่ถูกมองว่าได้รับการรับรองโดยอัตโนมัติ, และให้ Admin ค้นหา ตรวจเอกสาร ดูประวัติ และอนุมัติ/ปฏิเสธได้จากหน้ารายละเอียดที่มีสิทธิ์ควบคุม

## Current root cause

`src/app/api/auth/profile/route.ts` เขียน `isVerified` และ `verificationLevel=basic` จาก Firebase `email_verified` ตอนสร้างผู้ใช้ใหม่ ขณะที่ `src/app/admin/teachers/page.tsx` ใช้ `isVerified` เป็นตัวแบ่งรออนุมัติ/อนุมัติแล้ว จึงทำให้ email ที่ยืนยันแล้วถูกนับเป็นครูที่ผ่าน Admin ทั้งที่ไม่เคยมีการ review

หน้า detail เดิมแสดงเฉพาะ profile, courses และ paid payments ไม่มี KYC documents หรือ verification history และ action reject เดิมเปลี่ยนเพียง `verificationLevel` โดยไม่ reset `isVerified`

## Design

### State semantics

- `emailVerified`: สถานะยืนยันอีเมลจาก Firebase Auth
- `adminReviewStatus`: `pending | approved | rejected`
- `isVerified`: public trust flag; true เฉพาะเมื่อ Admin อนุมัติ
- `verificationLevel`: `none` เมื่อยังไม่ยืนยันอีเมล, `basic` เมื่อยืนยันอีเมลแล้วแต่ยังรอ Admin, `full` เมื่อ Admin อนุมัติ
- `kycStatus`: สถานะเอกสาร KYC เดิม; การอนุมัติครูต้องมีเอกสารบัตรประชาชนและสมุดบัญชีครบ
- `adminReviewedAt`, `adminReviewedBy`, `adminReviewNote`: audit metadata ล่าสุด

Legacy compatibility: records ที่มี `verificationLevel=full` และ `isVerified=true` ถือว่า approved; records ที่เป็น `basic` จะถือว่า pending จนกว่าจะมี Admin review ใหม่

### Admin workflow

- `/admin/teachers` ค้นหาด้วยชื่อ, อีเมล, UID, phone และ filter ด้วย Admin review status กับ KYC status
- list แสดงสถานะแยกกัน: email verification, Admin review, KYC/document completeness
- ไม่ให้กด approve/reject จาก list; ต้องเปิด detail ก่อน
- detail แสดง account/profile metadata, consent, KYC fields, masked payout account, courses, bookings, paid payments และ verification event timeline
- approve เป็น explicit server action และปฏิเสธถ้าเอกสารสำคัญไม่ครบ
- reject ต้องบันทึก note และทำให้ `isVerified=false`

### Document access

เอกสาร KYC เปิดผ่าน Admin-only Node route ที่ตรวจ session/role และ redirect ไป signed URL อายุสั้น 15 นาที โดยไม่แสดง raw Firebase download URL ในหน้า Admin

### Audit

บันทึก event ใน `teacherVerificationEvents` ผ่าน Admin SDK เท่านั้น โดยเก็บ teacher UID, action, reviewer UID, note และ timestamp

## Data repair

ก่อนเปิดใช้ flow ใหม่ ให้ปรับเฉพาะ `twodmattie@gmail.com` เป็น `emailVerified=true`, `isVerified=false`, `verificationLevel=basic`, `adminReviewStatus=pending`, `kycStatus=none` และไม่ลบข้อมูลใด ๆ

## Security and rollback

- ไม่ expose KYC URLs หรือ document path ใน public/client data
- Firestore rules อนุญาตอ่าน event เฉพาะ Admin และห้าม client write
- การ rollback code ทำได้โดย deploy commit ก่อนหน้า; data repair ย้อนกลับได้โดย Admin review ผ่าน flow ใหม่ แต่ไม่ควรตั้ง `isVerified=true` โดยไม่ตรวจเอกสาร
- ไม่แก้ไขหรือเปิดเผยไฟล์ untracked เดิมใน workspace

## Acceptance criteria

1. email verified teacher ใหม่แสดง `ยืนยันอีเมลแล้ว` และ `รอ Admin ตรวจสอบ`, ไม่แสดงเป็น approved
2. `twodmattie@gmail.com` ไม่อยู่ใน approved group และมี KYC status `none`
3. Admin ค้นหา UID/email ได้และเปิด detail ได้
4. Admin เห็นเอกสารที่มีผ่าน secure viewer และเห็นชัดเมื่อเอกสารยังไม่มี
5. approve/reject ต้องผ่าน server-side Admin guard; approve เอกสารไม่ครบต้อง fail
6. reject ทำให้ `isVerified=false` และมี audit event
7. targeted tests, typecheck และ production build ผ่าน
