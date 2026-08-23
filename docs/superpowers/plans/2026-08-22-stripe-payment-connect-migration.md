# Stripe Payment and Connect Migration Implementation Plan

**Goal:** Replace the Omise payment path with Stripe Checkout and Stripe Connect while preserving TutorFinder's mock fallback, manual bank transfer, 20% platform fee, and post-class escrow release.

**Architecture:** The server creates a Stripe Checkout Session for card and PromptPay payments. Stripe-hosted Checkout keeps card data outside TutorFinder. Stripe webhooks are the payment source of truth and call the existing idempotent payment/escrow functions. Teacher payouts remain controlled by the existing wallet and admin payout workflow; Connect account onboarding is added as a later live-payout boundary rather than silently transferring money immediately.

**Tech Stack:** Next.js 15 App Router, TypeScript, Firebase/Firestore, Stripe Node SDK, Stripe Checkout Sessions, Stripe webhooks, Google Secret Manager.

## Global Constraints

- Use Stripe Test Mode first; do not enable live payments implicitly.
- Do not collect or store raw card number, expiry, CVV, or Omise tokens in TutorFinder.
- Keep `PLATFORM_FEE_RATE = 0.2` and existing escrow fields/ledger semantics.
- Keep manual bank transfer and Mock Gateway available while Stripe credentials are absent.
- Keep historical `truemoney` payment records readable, but do not offer TrueMoney as a new Stripe payment method in Thailand.
- Omit `payment_method_types` from Stripe API calls so Dashboard-managed dynamic payment methods remain enabled.
- Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Secret Manager; only the publishable key may be client-visible.
- Verify Stripe webhook signatures before mutating payment records; use idempotent state transitions.

## Task 1: Stripe contract and regression tests

**Files:**
- Create: `scripts/verify-stripe-payment.cjs`
- Modify: `src/types/firestore.ts`
- Modify: `src/lib/payments/config.ts`
- Test: `scripts/verify-stripe-payment.cjs`

- [ ] Write failing assertions for Stripe mode, Checkout Session fields, Stripe webhook signature verification, preserved escrow function calls, removed raw card inputs, and no new TrueMoney option.
- [ ] Run `node scripts/verify-stripe-payment.cjs` and confirm it fails because the Stripe gateway/routes/UI do not exist yet.
- [ ] Add provider-aware payment mode types without breaking historical Firestore values.
- [ ] Run the verifier and confirm it passes.

## Task 2: Server Stripe gateway and Checkout Session route

**Files:**
- Create: `src/lib/payments/stripe.ts`
- Modify: `src/app/api/payments/initiate/route.ts`
- Modify: `src/lib/payments/config.ts`

- [ ] Add a `StripeClient` singleton using `STRIPE_SECRET_KEY` only on the server.
- [ ] Create Checkout Sessions in THB for one booking, with metadata `booking_id` and `payment_id`.
- [ ] Set `payment_intent_data[transfer_data]` only when a validated future Connect destination exists; otherwise keep funds on the platform for escrow.
- [ ] Add `integration_identifier` with a stable product label plus an 8-letter suffix.
- [ ] Return only `checkoutUrl`, `paymentId`, `providerRef`, mode, and expiry to the client.
- [ ] Keep Mock and bank-transfer initiation behavior backward compatible.

## Task 3: Checkout UI migration

**Files:**
- Modify: `src/components/booking/payment-flow.tsx`
- Modify: `src/lib/payments/config.ts`

- [ ] Replace card-number/name/expiry/CVV state and JSX with a Stripe Checkout redirect button.
- [ ] Keep PromptPay and card selection as Stripe Checkout options, and keep bank transfer/slip flow unchanged.
- [ ] Remove TrueMoney from the new-method list while retaining its type for historical records.
- [ ] Handle cancelled/expired Checkout returns without marking a payment paid.

## Task 4: Stripe webhook, refund, and escrow reconciliation

**Files:**
- Create: `src/app/api/payments/stripe-webhook/route.ts`
- Modify: `src/lib/payments/stripe.ts`
- Modify: `src/lib/payments/process.ts`
- Modify: `src/app/api/payments/confirm/route.ts`

- [ ] Verify `Stripe-Signature` against the raw request body and return 400 for invalid signatures.
- [ ] Handle `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, and relevant dispute events.
- [ ] Use `markPaymentPaid`, `markPaymentFailed`, and `refundPayment` as the only payment-state mutation path.
- [ ] Make duplicate webhook deliveries harmless using existing paid/refund guards plus provider event IDs.
- [ ] Make `confirm` redirect users to the Checkout URL and stop accepting Omise card tokens.

## Task 5: Configuration, validation, and rollout

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `.agent/state.md`

- [ ] Document `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_ENABLED`, and `PAYMENT_PROVIDER`.
- [ ] Add test-mode secrets to Secret Manager only when the user provides them; never print values.
- [ ] Run the Stripe verifier, root typecheck, production build, existing payment/privacy verifiers, and Functions tests.
- [ ] Deploy Hosting only after all checks pass, then verify the unauthenticated API contract and Stripe webhook negative-signature path.
- [ ] Keep live mode disabled until a real Stripe test checkout, PromptPay confirmation, refund, and escrow release are manually verified.
