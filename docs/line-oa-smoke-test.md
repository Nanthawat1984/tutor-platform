# LINE OA Smoke Test Evidence

สถานะรวม: **โค้ดครบและผ่าน local validation แล้ว แต่ยังไม่เคยยิง LINE จริง**
`LINE_NOTIFICATIONS_ENABLED=false` ทั้งใน `apphosting.yaml` และ `functions/.env`
(ผู้ใช้ยังรับข้อความไม่ได้จริง ๆ — ทุกรายการใน outbox ตกเป็น `skipped`)

ห้ามเปิด flag จนกว่ารายการภายนอกด้านล่างจะผ่านครบ **ด้วยบัญชีทดสอบที่ไม่มีข้อมูล KYC/การเงินจริง**

## Local validation — 2026-08-22 (รันซ้ำได้ทุกครั้งก่อน commit)

- `node scripts/build-line-rich-menu-assets.cjs` — PASS
- `node scripts/verify-line-link.cjs` — PASS
- `node scripts/verify-line-webhook.cjs` — PASS
- `node scripts/verify-line-oa.cjs` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `cd functions && npm test` — PASS
- `git diff --check` — PASS
- Rich Menu assets — PASS, `2500x1686` for default/parent/teacher
- Rich Menu `--dry-run` — PASS, no network mutation

ตั้งแต่ 1 ต.ค. 2026 สคริปต์ verify ทั้งสามตัวถูกผูกเข้า CI (`.github/workflows/ci.yml`)
และ `functions/test/line-delivery.test.cjs` ครอบ retry/backoff, permanent-vs-retryable
และ retry cap ซึ่งเดิมไม่มีเทสต์ — รวมเป็น 15 tests

## สิ่งที่ตั้งค่าไว้แล้วบน LINE Developers

ค่า identifier ถูก commit ใน `apphosting.yaml` แล้ว แต่ **ยังไม่มีหลักฐานว่าเรียกใช้งานจริงสำเร็จ**:

| รายการ | ค่า |
| --- | --- |
| OA Basic ID | `@966mqfzj` |
| LIFF ID | `2011204493-x3Zg7Ksl` |
| Channel ID | `2011204232` |
| Rich Menu (default/parent/teacher) | มี ID จริงทั้งสามชุดใน `apphosting.yaml` |

> ข้อสังเกต: เอกสารฉบับก่อนหน้าเขียนว่า "pending credentials" เพราะตอน 22 ส.ค. ยังไม่มีค่าเหล่านี้
> ภายหลังมีการตั้งค่าบน LINE Developers เรียบร้อยแล้ว แต่ไม่ได้บันทึกผลการทดสอบ
> ต้องยืนยันด้วยการรันรายการภายนอกด้านล่าง ไม่ใช่เชื่อว่าตั้งค่าแล้วจะทำงาน

## External smoke test — ยังไม่ผ่าน

ต้องรันด้วยบัญชี parent/teacher ทดสอบ (ไม่ใช่บัญชีจริง) และบันทึกผลกลับมาในไฟล์นี้:

1. เพิ่มเพื่อน OA `@966mqfzj` จากบัญชีทดสอบ → ควรได้ข้อความต้อนรับ + ปุ่ม "เชื่อมต่อบัญชี"
2. กดปุ่ม → เปิด LIFF → login → กลับมาที่ `/my-profile` แล้วเชื่อมสำเร็จ
   (หน้า profile ต้องขึ้น "เชื่อมแล้ว" และ Rich Menu เปลี่ยนเป็นชุดของ role นั้น)
3. ตรวจว่า Rich Menu ของ parent กับ teacher ต่างกันจริง
4. สร้าง booking → ครูได้รับ `booking.created`
5. เปลี่ยนสถานะ booking เป็น confirmed → ทั้งสองฝั่งได้รับ `booking.confirmed`
6. ชำระเงิน → `payment.pending` และ `payment.paid`
7. เปลี่ยน attendance → `attendance.changed`
8. ปล่อย escrow → ครูได้รับ `payment.released`
9. เลื่อนเวลาเรียนจากในแอป → อีกฝ่ายได้รับ `booking.rescheduled`
10. ยิง trigger ซ้ำ → ต้องไม่มีข้อความซ้ำ (outbox ใช้ doc ID แบบ deterministic)
11. ส่ง webhook ด้วยลายเซ็นผิด → ต้องได้ 401
12. ปิด `LINE_NOTIFICATIONS_ENABLED=false` แล้วยิง event → ธุรกรรมหลักยังสำเร็จ, outbox เป็น `skipped`
13. ผู้ใช้ที่ยังไม่เชื่อม → ต้องไม่ error, outbox เป็น `skipped` ด้วยเหตุผล `line_user_not_linked`

## การเปิดใช้งานจริง (หลังผ่านข้างบนเท่านั้น)

เปลี่ยน `LINE_NOTIFICATIONS_ENABLED` และ `NEXT_PUBLIC_LINE_NOTIFICATIONS_ENABLED`
ใน `apphosting.yaml` เป็น `"true"` **พร้อมกันทั้งสองตัว** (ฝั่ง server ส่งข้อความ, ฝั่ง client โชว์ปุ่มเชื่อมต่อ)
แล้ว deploy — ถ้าไม่ตรงกัน ผู้ใช้จะเห็นปุ่มที่กดแล้วไม่ได้รับอะไร

การปิดกลับ (rollback) ทำได้ทันทีด้วยการปรับสองตัวนั้นกลับเป็น `"false"` แล้ว deploy ซ้ำ
ออกเดินทาง: ข้อความที่อยู่ใน `pending` จะถูก retry cron ส่งต่อเมื่อเปิดใหม่ ส่วน `skipped` ต้อง enqueue ใหม่