// Guard: a Firestore query that combines where() + orderBy() needs a composite
// index. If the index is missing the page dies at RUNTIME with only a digest
// ("Application error: a server-side exception has occurred") — the build and
// `pnpm uat` both pass, because the emulator auto-creates indexes on demand.
//
// This checks statically that every such query in src/ is covered by an index
// declared in firestore.indexes.json. No credentials needed, so it runs in CI.
//
// Run: node scripts/verify-firestore-indexes.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TYPES = path.join(SRC, 'types', 'firestore.ts');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** COLLECTIONS.PACKAGES -> 'packages' (อ่านจาก src/types/firestore.ts) */
function loadCollectionNames() {
  const src = fs.readFileSync(TYPES, 'utf8');
  const names = new Map();
  for (const m of src.matchAll(/^\s*([A-Z0-9_]+):\s*'([^']+)'/gm)) names.set(m[1], m[2]);
  return names;
}

const indexJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8'));

/** key เทียบ index: Firestore ใช้ index ได้เมื่อ field set ครอบ query (order ของ equality ไม่สำคัญ) */
function covers(indexFields, queryFields) {
  const have = new Set(indexFields);
  for (const f of queryFields) if (!have.has(f)) return false;
  return true;
}

function main() {
  const collections = loadCollectionNames();
  const byGroup = new Map();
  for (const idx of indexJson.indexes || []) {
    if (!byGroup.has(idx.collectionGroup)) byGroup.set(idx.collectionGroup, []);
    byGroup.get(idx.collectionGroup).push((idx.fields || []).map((f) => f.fieldPath));
  }

  const problems = [];
  let checked = 0;

  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');

    // จับทั้ง db.collection(COLLECTIONS.X) และ db.collection('x')
    // ข้ามรูปแบบ client SDK ที่มีหลาย argument (collection(cdb, 'a', id, 'b'))
    const callRe = /\.collection\(\s*(COLLECTIONS\.([A-Z0-9_]+)|'([^']+)')\s*\)/g;
    for (const m of src.matchAll(callRe)) {
      const group = m[2] ? collections.get(m[2]) : m[3];
      if (!group) {
        problems.push(`${path.relative(ROOT, file)}: unknown collection ${m[1]} — add it to loadCollectionNames()`);
        continue;
      }

      // เก็บเฉพาะส่วนต่อจาก .collection(...) ไปจนกว่าจะเจอ .get()/.count()/จบ statement
      const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
      const end = tail.search(/\.(get|count|stream|onSnapshot)\s*\(|;\s*\n/);
      const chain = end === -1 ? tail : tail.slice(0, end);

      const fields = [];
      for (const w of chain.matchAll(/\.where\(\s*'([^']+)'/g)) fields.push(w[1]);
      const orderFields = [...chain.matchAll(/\.orderBy\(\s*'([^']+)'/g)].map((o) => o[1]);
      fields.push(...orderFields);
      if (fields.length === 0) continue;

      // ไม่มี orderBy → Firestore ใช้ single-field index + zigzag merge join ได้
      // orderBy อย่างเดียวโดยไม่มี where → ใช้ automatic single-field index ได้
      // ต้องมีทั้ง equality filter และ orderBy จึงจะต้องใช้ composite index
      if (orderFields.length === 0) continue;
      if (!chain.includes('.where(')) continue;

      checked++;
      const uniq = [...new Set(fields)];
      const candidates = byGroup.get(group) || [];
      const ok = candidates.some((idxFields) => covers(idxFields, uniq));
      if (!ok) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push(
          `${path.relative(ROOT, file)}:${line} — "${group}" query on [${uniq.join(', ')}] has no index in firestore.indexes.json`,
        );
      }
    }
  }

  if (problems.length) {
    console.error(`✗ ${problems.length} Firestore query(s) need a composite index that is not declared:\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nAdd the index to firestore.indexes.json, then create it in the live database:');
    console.error('  gcloud firestore indexes composite create --database=tutor --collection-group=<group> \\');
    console.error('    --field-config=field-path=<field>,order=<ascending|descending> ...');
    process.exit(1);
  }

  console.log(`✓ all ${checked} ordered Firestore queries have a declared composite index`);
}

main();
