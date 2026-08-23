const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const receipt = read('src/components/parent/payment-receipt.tsx');
const paymentsPage = read('src/app/(parent)/payments/page.tsx');
const successPage = read('src/app/(parent)/bookings/[id]/payment/success/page.tsx');
const connect = read('src/lib/payments/connect.ts');
const appHosting = read('apphosting.yaml');
const example = read('.env.example');
const payoutPage = read('src/app/(teacher)/profile/payout/page.tsx');
const adminPayouts = read('src/app/admin/payouts/page.tsx');
const bookingDetails = fs.existsSync(path.join(root, 'src/app/(parent)/bookings/[id]/page.tsx'))
  ? read('src/app/(parent)/bookings/[id]/page.tsx')
  : '';
const globalStyles = read('src/app/globals.css');
const paymentProcess = read('src/lib/payments/process.ts');

assert(receipt.includes('<PrintButton'), 'parent receipt must offer browser PDF printing');
assert(receipt.includes('print:hidden'), 'receipt print action must be hidden in print output');
assert(receipt.includes('receipt-a4-document'), 'parent receipt must use the A4 print document layout');
assert(globalStyles.includes('@page') && globalStyles.includes('size: A4'), 'print styles must define A4 paper size');
assert(paymentsPage.includes('/payments/${p.id}/receipt'), 'payments history must link to the protected receipt page');
assert(successPage.includes("PaymentReceipt"), 'payment success must render the shared receipt');
assert(paymentProcess.includes('generateReceiptNumber'), 'successful payments must receive a deterministic receipt number');
assert(paymentProcess.includes('receiptNumber') && paymentProcess.includes('receiptIssuedAt'), 'successful payments must persist receipt issuance metadata');
assert(successPage.includes('receiptNumber') || read('src/app/(parent)/payments/[id]/receipt/page.tsx').includes('receiptNumber'), 'receipt pages must prefer the issued receipt number');
assert(connect.includes('STRIPE_CONNECT_ENABLED'), 'Connect must have an explicit feature flag');
assert(connect.includes('STRIPE_CONNECT_LIVE_ENABLED'), 'live Connect transfers must have a separate kill switch');
assert(connect.includes('/v2/core/accounts'), 'new connected accounts must use Stripe Accounts v2');
assert(connect.includes('accountLinks.create'), 'teacher onboarding must be hosted by Stripe');
assert(connect.includes('source_transaction'), 'transfer helper must bind transfers to the source charge');
assert(connect.includes('STRIPE_CONNECT_LIVE_ENABLED') && connect.includes('sk_live_'), 'live transfer helper must fail closed');
assert(appHosting.includes('STRIPE_CONNECT_ENABLED'), 'App Hosting must define Connect mode');
assert(appHosting.includes('STRIPE_CONNECT_LIVE_ENABLED'), 'App Hosting must define live Connect lock');
assert(example.includes('STRIPE_CONNECT_LIVE_ENABLED=false'), 'example env must document live Connect lock');
assert(payoutPage.includes('StripeConnectOnboarding'), 'teacher payout page must expose Connect onboarding');
assert(adminPayouts.includes('connect_transfer'), 'admin payout approval must have an explicit Connect choice');
assert(adminPayouts.includes('isStripeConnectReadyForTransfers'), 'admin payout approval must re-check Connect readiness');
assert(adminPayouts.includes("payoutMethod: 'stripe_connect'"), 'Connect payout must be auditable on the payout record');
assert(adminPayouts.includes('runTransaction'), 'payout approval must atomically mark payout and debit the wallet');
assert(appHosting.includes('value: "false"'), 'Connect must remain fail-closed in App Hosting by default');
assert(bookingDetails.includes('booking.parentId !== session.uid'), 'booking details must enforce parent ownership');
assert(bookingDetails.includes('PaymentStatusBadge'), 'booking details must show payment status');

console.log('Receipt and Stripe Connect contract checks passed');
