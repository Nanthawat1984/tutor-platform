const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const types = read('src/types/firestore.ts');
const confirmRoute = read('src/app/api/payments/confirm/route.ts');
const paymentFlow = read('src/components/booking/payment-flow.tsx');
const badge = read('src/components/ui/badge.tsx');
const nav = read('src/components/layout/nav.tsx');
const adminPagePath = path.join(root, 'src/app/admin/payments/page.tsx');
const adminRoutePath = path.join(root, 'src/app/api/admin/payments/[id]/slip/route.ts');

assert.match(types, /PaymentStatus = .*awaiting_review/,
  'payments must model the awaiting_review state');
assert.match(types, /slipPath\?: string/,
  'payments must persist the private slip path');
assert.match(confirmRoute, /awaiting_review/,
  'bank transfer confirmation must enter awaiting_review');
assert.doesNotMatch(confirmRoute, /payment\.method === 'bank_transfer'[\s\S]{0,500}markPaymentPaid/,
  'bank transfer submission must not auto-approve payment');
assert.match(paymentFlow, /slipPath/,
  'parent payment flow must submit slipPath for review');
assert.match(badge, /awaiting_review:\s*\{\s*label:\s*'รอตรวจสอบสลิป'/s,
  'payment badge must show awaiting review');
assert.match(nav, /\/admin\/payments/,
  'admin navigation must expose payment review');
assert.equal(fs.existsSync(adminPagePath), true, 'admin payment review page must exist');
assert.equal(fs.existsSync(adminRoutePath), true, 'admin signed-slip route must exist');

const adminPage = read('src/app/admin/payments/page.tsx');
const adminSlipRoute = read('src/app/api/admin/payments/[id]/slip/route.ts');
assert.match(adminPage, /requireAdmin\(\)/, 'admin payment review must enforce admin access');
assert.match(adminPage, /markPaymentPaid|markPaymentFailed/, 'admin must approve or reject payments through server logic');
assert.match(adminSlipRoute, /role !== 'admin'/, 'payment slip viewing must enforce admin access');

console.log('Bank transfer review regression checks passed');
