const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => {
  const filePath = path.join(root, ...parts);
  assert.ok(fs.existsSync(filePath), `missing SEO file: ${parts.join('/')}`);
  return fs.readFileSync(filePath, 'utf8');
};

const layout = read('src', 'app', 'layout.tsx');
const robots = read('src', 'app', 'robots.ts');
const sitemap = read('src', 'app', 'sitemap.ts');
const publicData = read('src', 'lib', 'seo', 'public-teachers.ts');
const tutorsPage = read('src', 'app', 'tutors', 'page.tsx');
const tutorPage = read('src', 'app', 'tutors', '[id]', 'page.tsx');
const termsPage = read('src', 'app', 'terms', 'page.tsx');
const privacyPage = read('src', 'app', 'privacy', 'page.tsx');
const parentLayout = read('src', 'app', '(parent)', 'layout.tsx');
const teacherLayout = read('src', 'app', '(teacher)', 'layout.tsx');
const adminLayout = read('src', 'app', 'admin', 'layout.tsx');
const authLayout = read('src', 'app', '(auth)', 'layout.tsx');

assert.match(layout, /metadataBase/);
assert.match(layout, /alternates/);
assert.match(layout, /openGraph/);
assert.match(layout, /twitter/);
assert.match(robots, new RegExp('/api/'));
assert.match(robots, new RegExp('/explore'));
assert.match(sitemap, /tutors/);
assert.doesNotMatch(publicData, /idCard|payout|taxId|taxAddress|phone|email|lineUserId/i);
assert.match(publicData, /isActive/);
assert.match(publicData, /catch/, 'SEO data reads must fail safely when Firestore is unavailable');
assert.match(tutorsPage, /ItemList/);
assert.match(tutorsPage, /url:\s*`\$\{SITE_URL\}\/tutors`/);
assert.match(tutorPage, /application\/ld\+json/);
assert.match(tutorPage, /Person/);
assert.match(tutorPage, /AggregateRating/);
for (const [name, source] of Object.entries({ parentLayout, teacherLayout, adminLayout, authLayout })) {
  assert.match(source, /robots/, `${name} must mark private pages noindex`);
  assert.match(source, /index:\s*false/, `${name} must disable indexing`);
}

assert.doesNotMatch(tutorsPage, /requireSessionUser|requireRole/);
assert.doesNotMatch(tutorPage, /requireSessionUser|requireRole/);
assert.match(termsPage, /alternates/);
assert.match(privacyPage, /alternates/);

console.log('SEO regression checks passed');
