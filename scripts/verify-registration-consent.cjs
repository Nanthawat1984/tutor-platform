const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(...parts) {
  const filePath = path.join(__dirname, '..', ...parts);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

const registerPage = read('src', 'app', '(auth)', 'register', 'page.tsx');
const authHook = read('src', 'hooks', 'useFirebase.tsx');
const profileRoute = read('src', 'app', 'api', 'auth', 'profile', 'route.ts');
const termsPage = read('src', 'app', 'terms', 'page.tsx');
const consentGate = read('src', 'components', 'legal', 'consent-gate.tsx');

assert.match(registerPage, /ConsentGate/);
assert.match(registerPage, /consentAccepted/);
assert.match(registerPage, /registrationConsent/);
assert.match(authHook, /RegistrationConsent/);
assert.match(profileRoute, /consent_required/);
assert.match(profileRoute, /consentAcceptedAt/);
assert.match(termsPage, /ข้อตกลงผู้ใช้บริการ/);
assert.match(consentGate, /onScroll/);
assert.match(consentGate, /disabled=\{!hasReadToEnd/);

console.log('Registration consent check passed');
