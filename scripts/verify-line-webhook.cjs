const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/src/index.ts'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'scripts/setup-line-rich-menus.cjs'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('rawBody') && source.includes('JSON.stringify(req.body || {})'), 'Webhook must verify the raw request body');
assert(source.includes('x-line-signature'), 'Webhook must read the LINE signature header');
assert(source.includes('verifyLineWebhookSignature'), 'Webhook must verify the signature');
assert(source.includes("res.status(401).send('Invalid signature')"), 'Webhook must reject invalid signatures');
assert(source.includes("event.type === 'follow'"), 'Webhook must handle follow onboarding');
assert(!source.includes('functions.config().line?.channel_token'), 'Webhook must not use the legacy direct token path');
assert(setup.includes('--dry-run'), 'Rich Menu setup must support dry-run');
assert(setup.includes("'Content-Type': 'image/png'"), 'Rich Menu setup must upload PNG assets');
console.log('LINE webhook and Rich Menu checks passed');
