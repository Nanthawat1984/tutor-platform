const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const rules = read('firestore.rules');
const link = read('src/app/api/line/link/route.ts');
const outbox = read('functions/src/line/outbox.ts');
const config = read('functions/src/line/config.ts');
const webhook = read('functions/src/index.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(link.includes('verifyLineIdToken'), 'LIFF link route must verify LINE tokens');
assert(outbox.includes('createHash'), 'Outbox must derive deterministic IDs');
assert(outbox.includes('lineNotificationOutbox'), 'Outbox collection must be explicit');
assert(config.includes("'false'"), 'LINE notifications must default to disabled');
assert(rules.includes('lineNotificationOutbox') && rules.includes('allow read, write: if false'), 'Outbox must be server-only');
assert(rules.includes('lineUserId') && rules.includes('lineNotificationEnabled'), 'LINE identity fields must be protected by rules');
assert(webhook.includes('verifyLineWebhookSignature'), 'Webhook signature verification must be wired');
assert(!read('src/components/line/line-link-card.tsx').includes('LINE_CHANNEL_ACCESS_TOKEN'), 'Client must not contain LINE access token');
console.log('LINE OA integration checks passed');
