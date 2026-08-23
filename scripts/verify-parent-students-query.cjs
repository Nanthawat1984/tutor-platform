const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = [
  path.join('src', 'app', '(parent)', 'my-students', 'page.tsx'),
  path.join('src', 'app', '(parent)', 'bookings', 'new', 'page.tsx'),
];

for (const relativePath of pages) {
  const filePath = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(filePath, 'utf8');

  assert.doesNotMatch(
    source,
    /collection\(COLLECTIONS\.STUDENTS\)[\s\S]{0,180}\.orderBy\(['"]createdAt['"],\s*['"]asc['"]\)/,
    `${relativePath} must not require the unavailable students composite index`,
  );
}

console.log('Parent students query check passed');
