const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const loginForm = read('src/components/auth/login-form.tsx');
const googleAuth = read('src/lib/auth/google.ts');

assert.match(googleAuth, /return isMobile\(\) \? 'redirect' : 'popup'/,
  'mobile must use redirect sign-in');
assert.match(loginForm, /auth\/requests-from-referer/,
  'blocked Firebase API key referrers must have a specific user-facing message');

console.log('Google Login regression checks passed');
