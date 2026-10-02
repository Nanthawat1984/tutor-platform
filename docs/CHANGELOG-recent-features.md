# สรุปฟีเจอร์ที่เพิ่มล่าสุด (13 คอมมิต)

ช่วง `9211708..229671f` (13 คอมมิต) — 52 ไฟล์, +4812 / −180 บรรทัด
ทุกคอมมิตผ่าน `pnpm typecheck`, `pnpm test`, `pnpm build` และ `pnpm uat` (9 ขั้นตอน)

---

## ภาพรวมตามกลุ่มฟีเจอร์

| กลุ่ม | สถานะ |
|---|---|
| การจอง (เลื่อน/ยกเลิก/ข้อพิพาท) | ครบวงจร self-service + แอดมินตัดสินผลทางการเงิน |
| ผลการเรียน & รีวิว | ครูเขียนรายงานได้, moderation + หน้ารีวิวฝั่งครู |
| วอลเล็ต & คูปอง | เครดิตคืนเป็นวอลเล็ต, แอดมินปรับยอดได้, ระบบคูปองครบวงจร |
| ฟีเจอร์ฝั่งผู้ใช้ | รายการโปรดครู (favorites) |
| ความปลอดภัย | rate limit 9 endpoint เสี่ยง |
| คุณภาพโค้ด | unit test + E2E ครอบคลุมวงจรเงินและรายการโปรด |

---

## 1. `78f1e82` feat(bookings): เลื่อนคาบ + ข้อพิพาท self-service ครบวงจร

ต่อ UI ให้ API ที่มีอยู่แล้วใช้งานได้จริง

- `src/lib/booking-policy.ts` + `booking-policy.test.ts` (9 เทสต์) — กติกาเดียวใช้ร่วม server/client
  - ฟรี 2 ครั้ง/การจอง เมื่อแจ้งล่วงหน้า ≥ 24 ชม. (เลื่อนสายได้แต่ติดธงให้ครูเห็น)
  - ยกเลิกล่วงหน้า ≥ 24 ชม. คืนเต็ม / สายคืน 50%
- `src/components/booking/reschedule-form.tsx`, `dispute-form.tsx`
- `POST/PUT /api/bookings/[id]/reschedule`, `/dispute`
- เปิดข้อพิพาท = ระงับการเลื่อนคาบชั่วคราว
- หน้า `/admin/disputes` + `scripts/verify-reschedule-dispute-e2e.cjs` (ขั้นตอน UAT 7)

## 2. `08d85e0` feat(reviews): หน้า admin moderation รีวิว

- `/admin/reviews` — ซ่อน/แสดงรีวิวที่ไม่เหมาะสม
- **recompute rating ครูทันที** หลังซ่อน/แสดง (แก้ปัญหา rating เพี้ยนเมื่อรีวิวถูกซ่อน)
- `src/lib/firestore/queries.ts` — ดึงเฉพาะรีวิวที่ `hidden !== true`
- โปรไฟล์ครูฝั่งผู้ปกครองรับรู้รีวิวที่ถูกซ่อน

## 3. `37da3a7` feat(reports): รายงานผลการเรียนหลังเช็คชื่อ

- `src/lib/session-report.ts` + `session-report-validate.ts` + `session-report.test.ts` (4 เทสต์)
- หน้า `/teacher/attendance/report/[bookingId]` — ครูสรุปผลหลังจบคลาส
- ครูเลื่อนคาบเองได้จากหน้า attendance
- ผลรายงานไหลไป `/parent/progress` อัตโนมัติ

## 4. `427ff33` feat(dashboard): แดชบอร์ดครูอ่าน stat จริง

- แทนค่าคงที่ด้วยนับจริงจาก Firestore (รีวิว/นักเรียน/คอร์ส/รายได้)
- หน้า `/parent/payments` แสดงยอดวอลเล็ต + ประวัติธุรกรรม 5 รายการล่าสุด

## 5. `55f85d8` fix(payments): แสดงประวัติธุรกรรมวอลเล็ต

บั๊กเงื่อนไขกลับด้าน `balance !== totalCredited - totalSpent` ทำให้ query เป็น false เสมอ
→ เปลี่ยนเป็น query เมื่อ `wallet` มีจริงเท่านั้น (บั๊กจริงที่ผู้ใช้เจอ ไม่ใช่สมมติ)

## 6. `dd32267` feat(security): rate limit 9 endpoint เสี่ยง

ใช้ `src/lib/rate-limit.ts` (มี 12 เทสต์) pattern มาตรฐาน: sweep → check → 429 + header `Retry-After`

| Endpoint | จำนวน/หน้าต่าง |
|---|---|
| `payments/initiate`, `payments/confirm` | 10 / 10 นาที |
| `bookings/[id]/cancel` | 10 / 10 นาที |
| `bookings/[id]/dispute` | 5 / 10 นาที |
| `bookings/[id]/reschedule` | 15 / 10 นาที |
| `packages/purchase` | 5 / 10 นาที |
| `coupons/validate` | 30 / 10 นาที |
| `referrals` | 10 / 10 นาที |
| `line/link` | 10 / 10 นาที |

## 7. `9a45d50` test(wallet): unit test + UAT วงจรเงิน

- `src/lib/parent-wallet.test.ts` (13 เทสต์, mock Firestore)
- `scripts/verify-wallet-e2e.cjs` (ขั้นตอน UAT 8) — ยกเลิก → คืนเงิน → ใช้เครดิต
- **Invariant ที่ป้องกัน:** `balance === totalCredited - totalSpent` เสมอ

## 8. `08d2f2d` feat(reviews): หน้ารีวิวฝั่งครู

- `/teacher/reviews` — ดูรีวิวรวมที่ถูกซ่อน + กรอง 4 แบบ + สถิติ + ตอบกลับ (`reply`/`repliedAt`)
- ลิงก์ "รีวิว" ในเมนูครู
- คำตอบกลับแสดงบนโปรไฟล์ครูฝั่งผู้ปกครอง
- แดชบอร์ดครูมี section "เช็คชื่อวันนี้" + "รีวิวล่าสุด" ดึงข้อมูลจริงแทน EmptyState

## 9. `5e9614f` feat(disputes): แอดมินเลือกผลทางการเงินตอนตัดสิน

- ตัด logic คืนเงินออกจาก `cancelBooking` → `refundBookingMoney(db, booking, rate, notes)`
  คืนผล `{ ok, refunded, branch }` โดย `branch` = package / unpaid / full / half
- `resolveBookingDispute` รับ `outcome: 'no_refund' | 'refund_full' | 'refund_half'` + `adminId`
  - คืนเป็น**เครดิตวอลเล็ตเท่ายอดจ่ายจริง** ไม่แตะ escrow ของครู
  - กันคืนซ้ำด้วย `already_refunded`
  - บันทึก `dispute.outcome/refundedAmount/refundedKind/resolvedBy` + `payment.disputeRefund`
- `/admin/disputes` มี dropdown เลือกผล + banner สรุป
- UAT ขั้น 7 ตรวจว่าเครดิตกลับมาจริง

## 10. `56f7b02` feat(teacher): ครูจัดการคลาสของตัวเองครบ

- `/teacher/sessions/[id]` — รายละเอียดคลาสฝั่งครู
- `src/components/booking/cancel-booking-button.tsx` ใช้ร่วมครู/ผู้ปกครอง
  (**เดิมไม่มี UI ยกเลิกเลยทั้งระบบ** — API มีแต่เรียกไม่ได้)
- `POST /api/conversations` เปิดให้**ครูทักผู้ปกครอง**ได้ (เฉพาะคู่ที่เคยจองด้วยกัน, ส่ง `parentId`)
  - `useChat.openConversationWithParent`, `StartChatButton` รับ `teacherId | parentId`
- **แก้บั๊กจริง:** `resolveBookingDispute` อ่าน booking โดยไม่แนบ `id` → ส่ง `undefined` เข้า Firestore query

## 11. `e450af3` feat(favorites): รายการโปรดครูสำหรับชื่อส่วนตัว

- คอลเลกชัน `parentFavorites` (doc id = `${parentId}_${teacherId}`)
- `GET/POST /api/favorites` — parents_only, 404, rate limit 60/10 นาที
- `favorite-teacher-button.tsx` — optimistic update + rollback เมื่อพัง
- ปุ่มบนการ์ดใน `/explore` (ครูละปุ่มเดียว) และบนโปรไฟล์ครู
- หน้า `/parent/favorites` + ลิงก์ "ครูที่สนใจ" ในเมนู
- UAT ขั้น 9/9 `scripts/verify-favorites-e2e.cjs` (access control / idempotency / remove / 404)

## 12. `bc09181` feat(admin): ดูและปรับยอดเครดิตวอลเล็ตผู้ปกครอง

- `/admin/parents/[id]` — ยอดเครดิต + ฟอร์มปรับยอด
- เพิ่ม (`creditParentWallet`) / หัก (`debitParentWallet`, kind `'adjust'`) — หักไม่เกินยอด
- ตาราง 10 รายการล่าสุด + banner แจ้งผล

## 13. `229671f` feat(coupons): คูปองส่วนลดครบวงจร

- `src/lib/coupons.ts` เพิ่ม `createCoupon` / `setCouponActive` / `normalizeCouponCode`
- `/admin/coupons` — สถิติ + ฟอร์มออกคูปอง + ตาราง + กรอง + เปิด/ปิด + ลิงก์เมนูแอดมิน
- หน้า `/parent/payments` เรียก `ensureFirstBookingCoupon` แสดงการ์ดคูปองลูกค้าใหม่
  (ปิดช่องว่างเดิม — `/api/coupons/mine` มีอยู่แต่ไม่มีใครเรียก)
- หน้าชำระเงินคลาสรับ `initialCouponCode` + auto-check

---

## ผลการตรวจสอบล่าสุด

| คำสั่ง | ผล |
|---|---|
| `pnpm typecheck` | ผ่าน |
| `pnpm test` | 53/53 ผ่าน |
| `pnpm build` | ผ่าน |
| `pnpm uat` | 9/9 ผ่าน (wallet: 500→1000→+250→−500 = 750) |

> หมายเหตุ: `pnpm test` รันเฉพาะ `src/lib/*.test.ts` (ระดับบนสุด) จึงนับได้ 53 เทสต์
> ทั้งจริงมี 90 เทสต์ใน 17 ไฟล์ — ดูรายละเอียดใน [`ROADMAP-gaps.md`](./ROADMAP-gaps.md) หัวข้อ D1