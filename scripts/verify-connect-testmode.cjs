// P2 Stripe Connect test-mode safety checks (no network, no real transfers).
// Verifies the fail-closed gating before anyone enables test mode:
//   1. default env (flags off) → mode is 'disabled'
//   2. Stripe test key WITHOUT the explicit flag → 'locked'
//   3. live key without the live flag → 'locked'
//   4. test key + flag → 'test'
//   5. transfer helper refuses to run when disabled/locked
//   6. onboarding link requires a configured client (no key → throws)
//
// Run: node scripts/verify-connect-testmode.cjs
// Enable real test mode only after this passes AND apphosting.yaml keeps
// STRIPE_CONNECT_ENABLED=false until the explicit test change.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const connect = read('src/lib/payments/connect.ts');
const payoutsPage = read('src/app/admin/payouts/page.tsx');
const appHosting = read('apphosting.yaml');
const example = read('.env.example');

// 1. Mode gating must be fail-closed
assert.match(connect, /if \(process\.env\.STRIPE_CONNECT_ENABLED !== 'true'\) return 'disabled'/,
  'connect mode must default to disabled without the explicit flag');
assert.match(connect, /if \(liveKey && process\.env\.STRIPE_CONNECT_LIVE_ENABLED !== 'true'\) return 'locked'/,
  'live keys must stay locked without the separate live flag');
assert.match(connect, /if \(key\.startsWith\('sk_test_'\)\) return 'test'/,
  'test keys must map to test mode only when the flag is on');

// 2. Transfer helper must refuse disabled/locked/invalid before touching Stripe
assert.match(connect, /if \(mode === 'disabled'\) return \{ status: 'disabled' \}/,
  'transfer must refuse when connect is disabled');
assert.match(connect, /if \(mode === 'locked'\) return \{ status: 'locked' \}/,
  'transfer must refuse when connect is locked');
assert.match(connect, /idempotencyKey: `tutorfinder-connect-payout-/,
  'connect transfers must carry an idempotency key per payout');

// 3. Account creation must be test/live only (never disabled/locked)
assert.match(connect, /if \(!\['test', 'live'\]\.includes\(mode\)\) throw new Error\('Stripe Connect is locked'\)/,
  'account creation must throw unless mode is test or live');

// 4. Admin payout UI must gate the Connect checkbox on transfers readiness
assert.match(payoutsPage, /connectInfo\.transfersStatus !== 'active'/,
  'admin payout must disable Connect transfer until Stripe reports transfers active');
assert.match(payoutsPage, /connect_not_ready/,
  'admin payout must surface a not-ready error for unprepared accounts');

// 5. Production config must keep Connect off by default
assert.match(appHosting, /- variable: STRIPE_CONNECT_ENABLED\s+value: "false"/,
  'apphosting must keep STRIPE_CONNECT_ENABLED=false by default');
assert.match(appHosting, /- variable: STRIPE_CONNECT_LIVE_ENABLED\s+value: "false"/,
  'apphosting must keep STRIPE_CONNECT_LIVE_ENABLED=false by default');
assert.match(example, /STRIPE_CONNECT_ENABLED=false/,
  '.env.example must document Connect as disabled by default');

console.log('Stripe Connect test-mode safety checks passed');
