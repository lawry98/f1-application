import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guard for "never static-import the circuit set". `loadCircuit`'s template-literal import is
 * what makes the bundler emit one chunk per circuit, so a page drawing 24 circuits downloads 24.
 * A static import of an outline puts it in that module's bundle unconditionally, which is right
 * for exactly the three places below — each draws one known circuit at build time — and wrong
 * anywhere else. jsdom cannot see a bundle, so this reads the source.
 */
const ROOT = resolve(__dirname, '..');
const SCANNED = ['app', 'components', 'hooks', 'lib'];
const ALLOWED = [
  'app/candy/page.tsx',
  'components/briefing/briefing-chat.tsx',
  'components/landing/landing-hero.tsx',
];
const STATIC_OUTLINE_IMPORT = /from\s+['"]@\/data\/circuits\/[a-z]{2}-\d{4}\.json['"]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [relative(ROOT, full)] : [];
  });
}

const offenders = SCANNED.flatMap((dir) => sources(join(ROOT, dir))).filter((file) =>
  STATIC_OUTLINE_IMPORT.test(readFileSync(join(ROOT, file), 'utf8')),
);

describe('circuit outline imports', () => {
  it('statically imports an outline only where one known circuit is drawn', () => {
    expect(offenders.sort()).toEqual(ALLOWED);
  });
});
