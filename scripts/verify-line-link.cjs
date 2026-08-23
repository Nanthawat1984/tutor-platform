const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const linkRoute = fs.readFileSync(path.join(root, 'src/app/api/line/link/route.ts'), 'utf8');
const unlinkRoute = fs.readFileSync(path.join(root, 'src/app/api/line/unlink/route.ts'), 'utf8');
const liffVerifier = fs.readFileSync(path.join(root, 'src/lib/line/liff.ts'), 'utf8');
const linkCard = fs.readFileSync(path.join(root, 'src/components/line/line-link-card.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(linkRoute.includes('verifyIdToken'), 'LINE link route must verify Firebase auth');
assert(linkRoute.includes('verifyLineIdToken'), 'LINE link route must verify LINE ID token');
assert(linkRoute.includes('lineUserId'), 'LINE link route must persist the verified LINE user ID');
assert(!linkRoute.includes('body.lineUserId'), 'LINE link route must not trust a client lineUserId');
assert(unlinkRoute.includes('FieldValue.delete()'), 'LINE unlink route must remove the LINE identity');
assert(liffVerifier.includes('oauth2/v2.1/verify'), 'LIFF verifier must call the LINE verification endpoint');
assert(liffVerifier.includes('LINE_LOGIN_CHANNEL_ID'), 'LIFF verifier must use the LINE Login channel ID');
assert(liffVerifier.includes('payload.aud !== channelId'), 'LIFF verifier must enforce the configured channel');
assert(linkCard.includes('window.location.pathname') && linkCard.includes('/my-profile?line_link=1'), 'LIFF must initialize from the configured /my-profile endpoint path');
assert(linkCard.includes('onAuthStateChanged') && linkCard.includes('waitForFirebaseUser'), 'LIFF link must wait for Firebase auth restoration on mobile');
assert(fs.readFileSync(path.join(root, 'src/app/(parent)/my-profile/page.tsx'), 'utf8').includes("session.role === 'teacher' && params.line_link === '1'"), 'Teacher LIFF handoff must render on the configured endpoint path');
console.log('LINE link route checks passed');
