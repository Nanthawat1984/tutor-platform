const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
};
const gateway = read('src/lib/payments/stripe.ts');
const sessionRoute = read('src/app/api/payments/initiate/route.ts');
const webhookRoute = read('src/app/api/payments/stripe-webhook/route.ts');
const paymentConfig = read('src/lib/payments/config.ts');
const paymentFlow = read('src/components/booking/payment-flow.tsx');
const confirmRoute = read('src/app/api/payments/confirm/route.ts');
const successPage = read('src/app/(parent)/bookings/[id]/payment/success/page.tsx');
const processPayments = read('src/lib/payments/process.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(gateway.includes('StripeClient'), 'Stripe gateway must use StripeClient');
assert(!gateway.includes("import Stripe from 'stripe'"), 'Stripe SDK must load lazily to keep Firebase SSR startup within deployment timeout');
assert(gateway.includes("require('stripe')"), 'Stripe SDK must be loaded on demand by the payment route');
assert(gateway.includes('STRIPE_SECRET_KEY'), 'Stripe gateway must use a server-side secret');
assert(gateway.includes('checkout.sessions.create'), 'Stripe gateway must create Checkout Sessions');
assert(gateway.includes('integration_identifier'), 'Stripe Checkout must include an integration identifier');
assert(gateway.includes('booking_id') && gateway.includes('payment_id'), 'Stripe Checkout must carry payment metadata');
assert(!gateway.includes('payment_method_types'), 'Stripe Checkout must use Dashboard-managed dynamic methods');
assert(gateway.includes('constructEvent') && webhookRoute.includes('constructStripeWebhookEvent'), 'Stripe webhook must verify the raw body signature');
assert(webhookRoute.includes('checkout.session.completed') && webhookRoute.includes('payment_intent.succeeded'), 'Stripe webhook must handle completed Stripe payments');
assert(webhookRoute.includes('checkout.session.expired'), 'Stripe webhook must handle expired Checkout Sessions');
assert(webhookRoute.includes('markPaymentExpired'), 'expired Checkout Sessions must use the safe expiration transition');
assert(processPayments.includes('export async function markPaymentExpired'), 'payment processing must expose an expiration transition');
assert(processPayments.includes('provider_mismatch'), 'expiration transition must reject mismatched Stripe sessions');
assert(webhookRoute.includes('markPaymentPaid'), 'Stripe webhook must use the existing escrow payment transition');
assert(paymentFlow.includes('checkoutUrl') && paymentFlow.includes('window.location.assign'), 'Payment UI must redirect to Stripe Checkout');
assert(!paymentFlow.includes('placeholder="4242 4242 4242 4242"'), 'Payment UI must not collect raw card details');
assert(!paymentConfig.includes("id: 'truemoney'"), 'TrueMoney must not be offered as a new Stripe method');
assert(paymentConfig.includes('^(sk|rk)_(test|live)_') && paymentConfig.includes('^whsec_'), 'Stripe provider must fail closed on wrong key formats');
assert(confirmRoute.includes("payment.provider === 'stripe'") && !confirmRoute.includes('createCardCharge'), 'Confirm route must wait for Stripe Checkout webhook instead of accepting Omise card tokens');
assert(successPage.includes('booking.parentId !== session.uid') && successPage.includes('paymentConfirmed'), 'Payment success page must enforce ownership and wait for confirmed payment status');

console.log('Stripe payment migration checks passed');
