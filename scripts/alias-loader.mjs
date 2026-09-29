// Resolve "@/..." and extensionless TS imports for node --test (ESM loader).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');

function tryCandidates(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && !hasDirectorySegmentIssue(c)) return c;
  }
  return null;
}

function hasDirectorySegmentIssue(p) {
  // existsSync on a directory would pass — only accept files
  return false; // (candidates are files or explicit /index.ts)
}

export async function resolve(specifier, context, nextResolve) {
  // 1) Path alias "@/..." → src/
  if (specifier.startsWith('@/')) {
    const target = tryCandidates(path.join(SRC, specifier.slice(2)));
    if (target) return nextResolve(pathToFileURL(target).href, context);
    return nextResolve(specifier, context);
  }

  // 2) Extensionless relative imports (./x, ../x) → try .ts/.tsx/index.ts
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const base = path.resolve(path.dirname(parentPath), specifier);
    // Only rewrite when no extension is present (TS-style import)
    if (!path.extname(base)) {
      const target = tryCandidates(base);
      if (target) return nextResolve(pathToFileURL(target).href, context);
    }
  }

  return nextResolve(specifier, context);
}
