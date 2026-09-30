import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { LandingHero } from '@/components/landing/landing-hero';

const ROOT = resolve(__dirname, '..');

/**
 * The guard for copy that named the wrong vendor.
 *
 * The site said "powered by Claude AI" in its metadata, the hero and the how-it-works band while
 * the backend called Gemini. Nothing failed: the strings were only ever pinned by tests that
 * asserted them verbatim, so those tests held the wrong claim in place rather than catching it.
 * This file ties the copy to the model the backend actually calls instead.
 */

/** Read out of the Python source rather than retyped, like `OPENF1_FIRST_YEAR` in `standings.test.ts`. */
function backendModel(): string | undefined {
  const source = readFileSync(resolve(ROOT, '../backend/config.py'), 'utf8');
  return /^LLM_MODEL: str = "([^"]+)"$/m.exec(source)?.[1];
}

/** `gemini-3.6-flash` → `Gemini 3.6 Flash`, the way Google writes its model IDs as names. */
function displayName(modelId: string): string {
  return modelId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The source with its comments removed, so a code comment may name a vendor and copy may not.
 *
 * TS and TSX go through the compiler's own printer rather than a regex: a `//` inside a URL string
 * would end a regex's "line comment" early, and JSX text can hold an apostrophe that a hand-rolled
 * tokenizer reads as the start of a string.
 */
function withoutComments(path: string, source: string): string {
  const ext = extname(path);
  if (ext === '.ts' || ext === '.tsx') {
    const kind = ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind);
    return ts.createPrinter({ removeComments: true }).printFile(file);
  }
  if (ext === '.css') return source.replace(/\/\*[\s\S]*?\*\//g, '');
  if (ext === '.md') return source.replace(/<!--[\s\S]*?-->/g, '');
  return source;
}

function filesUnder(dir: string): string[] {
  return (readdirSync(resolve(ROOT, dir), { recursive: true }) as string[])
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(resolve(ROOT, path)).isFile());
}

// Case-sensitive on purpose: `CLAUDE.md` is a filename, not a vendor claim.
const OTHER_VENDOR = /\bClaude\b|Anthropic/;
const SCANNED = ['app', 'components', 'lib'].flatMap(filesUnder);

describe('the model the copy names', () => {
  it('is read out of backend/config.py', () => {
    expect(backendModel()).toMatch(/^gemini-/);
  });

  it('is the one the hero badge names', () => {
    // The badge is the one place the copy names a version, so it is the one place that can drift
    // from a model change. It reads "<model> · LangGraph · FastF1"; the model is the first item.
    render(createElement(LandingHero));
    const badge = screen.getByText(/LangGraph/);
    const named = badge.textContent?.split('·')[0]?.trim();

    expect(named).toBe(displayName(backendModel() ?? ''));
  });

  it('never names another vendor in app/, components/ or lib/', () => {
    // Non-vacuity: the walk reaches the files that carried the old claim.
    expect(SCANNED).toEqual(
      expect.arrayContaining(['app/layout.tsx', 'components/landing/landing-hero.tsx']),
    );

    const offenders = SCANNED.flatMap((path) =>
      withoutComments(path, readFileSync(resolve(ROOT, path), 'utf8'))
        .split('\n')
        .filter((line) => OTHER_VENDOR.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );

    expect(offenders).toEqual([]);
  });

  it('strips comments without stripping copy', () => {
    // The scan above passes trivially if this ever strips too much, so it is pinned directly.
    const source = [
      '// Claude in a line comment',
      '/* Claude in a block comment */',
      "const url = 'https://example.com/Anthropic';",
      "const el = <p>{/* Claude in JSX */}Claude AI isn't here</p>;",
    ].join('\n');
    const stripped = withoutComments('x.tsx', source);

    expect(stripped).toContain('https://example.com/Anthropic');
    expect(stripped).toContain("Claude AI isn't here");
    expect(stripped).not.toMatch(/in a (line|block) comment|in JSX/);
  });
});
