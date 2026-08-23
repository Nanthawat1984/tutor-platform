# LINE OA Smoke Test Evidence

## Local validation — 2026-08-22

- `node scripts/build-line-rich-menu-assets.cjs` — PASS
- `node scripts/verify-line-link.cjs` — PASS
- `node scripts/verify-line-webhook.cjs` — PASS
- `node scripts/verify-line-oa.cjs` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `cd functions && npm test` — PASS, 7 tests
- `git diff --check` — PASS
- Rich Menu assets — PASS, `2500x1686` for default/parent/teacher
- Rich Menu `--dry-run` — PASS, no network mutation

## External smoke test — pending credentials

ยังไม่ได้เรียก LINE จริง เพราะ workspace ยังไม่มี Channel ID, Channel Secret, Channel Access Token และ LIFF ID ที่ใช้งานจริง จึงยังไม่ยืนยันผลต่อไปนี้:

- เพิ่มเพื่อน OA `@966mqfzj`
- LIFF link ด้วย parent/teacher test accounts
- role-specific Rich Menu assignment
- booking/payment/attendance/payout LINE delivery
- invalid signature และ LINE API failure บน deployed webhook

ห้ามเปิด `LINE_NOTIFICATIONS_ENABLED=true` หรือ deploy Rich Menu จริงจนกว่ารายการภายนอกนี้จะผ่านด้วยบัญชีทดสอบที่ไม่มีข้อมูล KYC/การเงินจริง
