const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const apphosting = read('apphosting.yaml');
const nextConfig = read('next.config.js');

assert.match(apphosting, /NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN[\s\S]*?value:\s*tutorfinder\.pilotai\.space/,
  'App Hosting must use the custom domain as Firebase authDomain');
assert.match(nextConfig, /source:\s*'\/__\/auth\/:path\*'/,
  'App Hosting must proxy Firebase auth helper requests');
assert.match(nextConfig, /firebaseHelperOrigin\s*=\s*'https:\/\/tutor-platform-4e38f\.web\.app'/,
  'Firebase auth helper proxy must target the project Firebase domain');

console.log('Google auth-domain regression checks passed');
