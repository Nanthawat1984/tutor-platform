const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const rules = read('firestore.rules');
const link = read('src/app/api/line/link/route.ts');
const outbox = read('functions/src/line/outbox.ts');
const config = read('functions/src/line/config.ts');
const webhook = read('functions/src/index.ts');
const appHosting = read('apphosting.yaml');
const envExample = read('.env.example');
const webOutbox = read('src/lib/line-outbox.ts');
const webLineTypes = read('src/types/line.ts');
const fnLineTypes = read('functions/src/line/types.ts');
const clientConfig = read('src/lib/line/config.ts');
const linkCard = read('src/components/line/line-link-card.tsx');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(link.includes('verifyLineIdToken'), 'LIFF link route must verify LINE tokens');
assert(outbox.includes('createHash'), 'Outbox must derive deterministic IDs');
assert(outbox.includes('lineNotificationOutbox'), 'Outbox collection must be explicit');
assert(config.includes("'false'"), 'LINE notifications must default to disabled');
assert(
  /variable:\s*LINE_NOTIFICATIONS_ENABLED\s*\n\s+value:\s*["']false["']/.test(appHosting),
  'App Hosting must keep LINE notifications disabled until external smoke test passes',
);
assert(rules.includes('lineNotificationOutbox') && rules.includes('allow read, write: if false'), 'Outbox must be server-only');
assert(rules.includes('lineUserId') && rules.includes('lineNotificationEnabled'), 'LINE identity fields must be protected by rules');
assert(webhook.includes('verifyLineWebhookSignature'), 'Webhook signature verification must be wired');
assert(!linkCard.includes('LINE_CHANNEL_ACCESS_TOKEN'), 'Client must not contain LINE access token');

// The stub superseded by functions/src/line/* and src/lib/line/* must not come back.
// It carried the retired LINE Notify API and a non-constant-time signature compare.
assert(!exists('src/lib/line.ts'), 'Retired LINE stub src/lib/line.ts must stay deleted');

// Next.js and Cloud Functions must agree on what the feature flag means — otherwise
// LINE_NOTIFICATIONS_ENABLED=1 turns on delivery in one tier only.
for (const value of ["'1'", "'true'", "'yes'", "'on'"]) {
  assert(config.includes(value), `Functions flag parsing must accept ${value}`);
  assert(
    webOutbox.includes(value),
    `Next.js outbox must parse the flag identically to Functions (missing ${value})`,
  );
}
assert(
  !webOutbox.includes("LINE_NOTIFICATIONS_ENABLED === 'true'"),
  'Exact-string flag comparison diverges from Functions readBoolean',
);

// Dedup must be atomic on both write paths or a retried trigger can double-send.
assert(webOutbox.includes('runTransaction'), 'Next.js outbox dedup must run in a transaction');

// Every eventType the app emits must exist in the shared union, or the outbox
// writer is silently accepting typos.
assert(webLineTypes.includes('booking.rescheduled'), 'Shared event union must include booking.rescheduled');
assert(fnLineTypes.includes('booking.rescheduled'), 'Functions event union must include booking.rescheduled');
assert(
  webOutbox.includes('lineEventType?: LineNotificationEvent'),
  'notifyUser must type lineEventType against the union instead of a bare string',
);

// Public env the client actually reads must be declared, not left to a hardcoded fallback.
assert(
  appHosting.includes('NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID'),
  'NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID must be declared in apphosting.yaml',
);
assert(
  appHosting.includes('NEXT_PUBLIC_LINE_NOTIFICATIONS_ENABLED'),
  'NEXT_PUBLIC_LINE_NOTIFICATIONS_ENABLED must be declared in apphosting.yaml',
);
assert(envExample.includes('NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID'), '.env.example must document the public OA id');
assert(!linkCard.includes('@966mqfzj'), 'Client must not hardcode the LINE Official Account id');
assert(!linkCard.includes('line.me/R/ti/p'), 'Client must build the add-friend link from config');

console.log('LINE OA integration checks passed');