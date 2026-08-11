# /credits attribution page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/credits` into a real attribution page that lists every third-party asset — 22 driver photographs, 10 team logos, the 3D model — with author, licence and source, generated at build time from the markdown files that stay canonical.

**Architecture:** Three units. `frontend/lib/credits.ts` reads a markdown file, finds a table **by its header row**, and returns typed rows or throws. `frontend/components/credits/attribution-table.tsx` is pure presentation over those rows. `frontend/app/credits/page.tsx` composes them and holds the prose. The `/teams` footer link stops pointing at the raw `.md` and points at `/credits#driver-photographs`.

**Tech Stack:** Next.js 14.2.18 App Router (server components, no `'use client'` anywhere in this work), TypeScript strict + `noUncheckedIndexedAccess`, Tailwind, `next/image`, Vitest + jsdom + React Testing Library, `agent-browser` 0.33.2 (axe) for the visual gate.

**Spec:** [`docs/superpowers/specs/2026-08-11-credits-page-design.md`](../specs/2026-08-11-credits-page-design.md)
**Baseline:** worktree `/Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles`, branch `feat/teams-navigation-and-perf` @ `4ed9e2d`, 324 tests passing across 24 files.

## Global Constraints

- **Work only in the worktree above.** Run `git branch --show-current` and confirm `feat/teams-navigation-and-perf` before the first edit. Do not touch `/Users/lawrencecrasto/Documents/personal/f1` — different branch, another session's uncommitted work.
- **`node`, `pnpm` and `npx` are not on `PATH`.** Prefix every command with `mise exec --`, or `export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"` once per shell. `agent-browser` is installed globally but still needs that export.
- **The dev server for this worktree is already running on :3000.** `curl -so /dev/null -w '%{http_code}' http://localhost:3000/credits` before starting another one. **Never run `pnpm build` while it runs** — shared `.next` breaks the live server with `MODULE_NOT_FOUND`.
- **Stage explicit paths.** Other agents work this repo concurrently; never `git add -A`.
- The markdown files `frontend/public/drivers/CREDITS.md` and `frontend/public/logos/CREDITS.md` are **canonical and read-only for this work**. Do not edit, move or delete them.
- **A malformed credit row throws.** No `try`/`catch`, no skipped rows, no placeholder strings anywhere in `lib/credits.ts`. The backend's "tools never raise" convention is about the LLM pipeline and does not apply here.
- **`f1-red` (`#dc2626`) measures 4.12:1 on `zinc-950`** — large headings and rules only, never small text.
- Restyle tokens, used verbatim: ground `bg-zinc-950`, body `text-zinc-400`, emphasis `text-zinc-300`, links `text-zinc-300 underline decoration-zinc-700 underline-offset-2` + `hover:text-white hover:decoration-zinc-400` + `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500`, labels `text-[10px] uppercase tracking-[0.2em]`, hairlines `border-zinc-800`.
- File names are **kebab-case, no exceptions**; component names stay PascalCase; **named exports** outside `app/`.
- Two things on the page are already accurate and must not be "corrected": **"Next.js 14"** (14.2.18 is installed) and **"Gemini 3.6 Flash"**.
- `tests/` is flat. Nothing here adds a top-level directory, so `next.config.js`'s `eslint.dirs` needs **no** new entry.
- Gates for every task: `mise exec -- pnpm test -- --run`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`, all from `frontend/`.

## Deviation from the spec, decided before planning

The spec's Data-sources section says **"adds OpenF1"**. That is not true of this codebase: `git grep -il openf1` returns nothing on `HEAD` and nothing on `origin/main`. The OpenF1 migration lives on the unmerged `feat/openf1-results-migration` branch only, which is where the claim came from. Putting it on a user-facing credits page would be a false statement about the app, so **Task 3 Step 8 is guarded**: it adds the row only if OpenF1 is present in the backend at execution time, and otherwise leaves Data sources with the three sources this branch actually uses.

## File Structure

| File | Responsibility |
|---|---|
| **Create** `frontend/lib/credits.ts` | Pure data. Markdown → typed rows, matched by header row. Throws on anything malformed. Depends on `node:fs`, `node:path`. |
| **Create** `frontend/components/credits/attribution-table.tsx` | Pure presentation. Rows + a thumbnail base path → a real `<table>`. No I/O, no data knowledge. |
| **Rewrite** `frontend/app/credits/page.tsx` | Thin composition + prose. Calls the four read functions, renders two `AttributionTable`s and the inline marque-marks table. |
| **Create** `frontend/tests/credits-data.test.ts` | Parser: real files for the happy path, inline markdown strings for every throw. |
| **Create** `frontend/tests/attribution-table.test.tsx` | Rendering, thumbnail `src`, accessible names, contrast bar, table semantics. |
| **Create** `frontend/tests/credits-page.test.tsx` | Page smoke test: section ids, 32 thumbnails, marque rows, `f1-red` only on headings. |
| **Modify** `frontend/components/teams/teams-comparison-grid.tsx:174-193` | Footer link `href` → `/credits#driver-photographs`, and the comment above it. |
| **Modify** `frontend/tests/driver-credits.test.tsx:91` | The one assertion that pins the old href. The other five invariants are untouched. |
| **Modify** `CLAUDE.md` | Two notes with Task 1, one bullet with Task 2. |

**Why three units and not one page:** the page could not otherwise be tested through its parts, and the parser's header-row matching is the single highest-risk piece of logic in the task. Note that the page ends up **synchronous** (`readFileSync`, not `await`), so React Testing Library *can* render it — the spec assumed an async server component. We take the free smoke test in Task 3 rather than repeat that assumption.

---

### Task 1: `lib/credits.ts` — the parser

**Files:**
- Create: `frontend/lib/credits.ts`
- Create: `frontend/tests/credits-data.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface CreditRow { file: string; subject: string; sourceTitle: string; sourceUrl: string; author: string; licence: string }`
  - `interface MarqueNote { file: string; whatItIs: string; whatItIsMissing: string }`
  - `tableRows(markdown: string, header: string[], where: string): string[][]`
  - `parseCreditRows(markdown: string, header: string[], where: string): CreditRow[]`
  - `readDriverCredits(): CreditRow[]` — 22 rows today
  - `readLogoCredits(): CreditRow[]` — 10 rows today
  - `readMarqueNotes(): MarqueNote[]` — 4 rows today
  - `readLicenceTerms(): Map<string, string>` — 6 entries today, licence name → terms URL

**Context the implementer needs:**

`frontend/public/logos/CREDITS.md` contains **two** tables whose rows both lead with a backticked filename — the credit table (10 rows) and a `| File | What it is | What it is missing |` table (4 rows). A naive `` `*.svg` `` scan over the file therefore finds **14 rows for 10 files**. `drivers/CREDITS.md` has the same shape of problem with its `| Licence | Terms |` table. Matching on the header row is the whole point of this module.

The four header rows, exactly as they appear:

```
| File | Driver | Commons source | Author | Licence |
| File | Team | Commons source | Attributed to | Licence |
| File | What it is | What it is missing |
| Licence | Terms |
```

Two file-format details that will bite:
- Commons source cells are `[title](url)` and the **URL contains literal parentheses** (`…_(cropped).jpg`), so a `[^)]+` URL pattern fails. Use a greedy `.+` anchored on the final `)`.
- The licence-terms cells are markdown autolinks — `<https://…>` — not bare URLs. Strip the angle brackets.
- The driver rows use the licence name `CC0` while the terms table calls it `CC0 1.0`. That is a **real mismatch in the source data and is left alone**: `readLicenceTerms().get('CC0')` is `undefined`, and the table renders that one licence as plain text. Do not "fix" the markdown, do not alias it in code, and do not throw.

`tsconfig.json` sets `noUncheckedIndexedAccess`, so every array index is `T | undefined`. Use `!` after a length check, the way `tests/driver-credits.test.tsx` already does. It also predates `downlevelIteration`, so **do not spread a `matchAll` iterator** — this module splits lines instead.

Paths resolve from `process.cwd()`, which is `frontend/` under both Next and Vitest. `import.meta.url` is deliberately not used: under jsdom it is not a `file:` URL and `fileURLToPath` throws at import time.

- [ ] **Step 1: Confirm the worktree, then write the failing test**

```bash
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git branch --show-current   # must print feat/teams-navigation-and-perf
```

Create `frontend/tests/credits-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseCreditRows,
  readDriverCredits,
  readLicenceTerms,
  readLogoCredits,
  readMarqueNotes,
  tableRows,
} from '@/lib/credits';

// Resolved from the cwd, not `import.meta.url`: under the jsdom environment `import.meta.url`
// is not a file: URL, so fileURLToPath throws at import time. Vitest runs from `frontend/`.
function assets(dir: string, ext: string): string[] {
  return readdirSync(join(process.cwd(), 'public', dir))
    .filter((f) => f.endsWith(ext))
    .sort();
}

const DRIVER_HEADER = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];

describe('credit table parsing', () => {
  // THE regression guard for this module. `logos/CREDITS.md` has a second table whose four rows
  // also lead with a backticked filename, so a naive `\`*.svg\`` scan finds 14 rows for 10 files.
  it('reads ten logo credits, not the fourteen a filename scan would find', () => {
    const rows = readLogoCredits();
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.file).sort()).toEqual(assets('logos', '.svg'));
  });

  it('credits every committed headshot exactly once', () => {
    const rows = readDriverCredits();
    expect(rows.map((r) => r.file).sort()).toEqual(assets('drivers', '.png'));
  });

  it('gives every row an author, a licence, a subject and a Commons source', () => {
    for (const row of [...readDriverCredits(), ...readLogoCredits()]) {
      expect(row.author, `${row.file} author`).not.toBe('');
      expect(row.licence, `${row.file} licence`).not.toBe('');
      expect(row.subject, `${row.file} subject`).not.toBe('');
      expect(row.sourceTitle, `${row.file} source title`).not.toBe('');
      expect(row.sourceUrl, `${row.file} source url`).toMatch(
        /^https:\/\/commons\.wikimedia\.org\//,
      );
    }
  });

  // The Commons titles carry literal parentheses, so a `[^)]+` URL pattern silently truncates
  // the href. This row is the shortest one that proves the greedy match is right.
  it('keeps parentheses inside a source URL', () => {
    const alonso = readDriverCredits().find((r) => r.file === 'fernando-alonso.png');
    expect(alonso?.sourceUrl).toBe(
      'https://commons.wikimedia.org/wiki/File:Alonso-68_(24710447098).jpg',
    );
  });

  it('reads the four marque notes, each naming a committed logo', () => {
    const notes = readMarqueNotes();
    expect(notes).toHaveLength(4);
    const logos = new Set(assets('logos', '.svg'));
    for (const note of notes) {
      expect(logos.has(note.file), note.file).toBe(true);
      expect(note.whatItIs).not.toBe('');
      expect(note.whatItIsMissing).not.toBe('');
    }
    expect(notes.find((n) => n.file === 'ferrari.svg')?.whatItIs).toBe('the Ferrari wordmark');
  });

  it('maps licence names to their terms URLs, stripping the autolink brackets', () => {
    const terms = readLicenceTerms();
    expect(terms.get('CC BY-SA 4.0')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(terms.get('OGL 3')).toBe(
      'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    );
  });

  // The source data disagrees with itself: driver rows say `CC0`, the terms table says `CC0 1.0`.
  // That is left alone on purpose — an unlinked licence name is fine, a rewritten source file is
  // not — so exactly one licence in use has no terms entry, and the table renders it as text.
  it('leaves CC0 without a terms entry and every other licence in use with one', () => {
    const terms = readLicenceTerms();
    const used = new Set(readDriverCredits().map((r) => r.licence));
    const unlinked = Array.from(used).filter((licence) => !terms.has(licence));
    expect(unlinked).toEqual(['CC0']);
  });
});

describe('credit table parsing failures', () => {
  const header = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];
  const good =
    '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author | CC BY 4.0 |';

  function md(...rows: string[]): string {
    return ['# doc', '', `| ${header.join(' | ')} |`, '|---|---|---|---|---|', ...rows, ''].join(
      '\n',
    );
  }

  it('throws when the header row is absent', () => {
    expect(() => parseCreditRows('# doc\n\nno tables here\n', header, 'x.md')).toThrow(
      /no table with header/,
    );
  });

  it('throws when the header is not followed by a separator', () => {
    const noSeparator = ['# doc', '', `| ${header.join(' | ')} |`, good, ''].join('\n');
    expect(() => parseCreditRows(noSeparator, header, 'x.md')).toThrow(/separator/);
  });

  it('throws when the table has no rows', () => {
    expect(() => parseCreditRows(md(), header, 'x.md')).toThrow(/has no rows/);
  });

  it('throws on a row with too few cells', () => {
    expect(() => parseCreditRows(md('| `a.png` | A | CC BY 4.0 |'), header, 'x.md')).toThrow(
      /has 3 cells, expected 5/,
    );
  });

  it('throws on an empty author', () => {
    const empty =
      '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) |  | CC BY 4.0 |';
    expect(() => parseCreditRows(md(empty), header, 'x.md')).toThrow(/empty author/);
  });

  it('throws on an empty licence', () => {
    const empty =
      '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author |  |';
    expect(() => parseCreditRows(md(empty), header, 'x.md')).toThrow(/empty licence/);
  });

  it('throws when the source cell is not a markdown link', () => {
    const bare = '| `a.png` | A | commons.wikimedia.org/wiki/File:t.jpg | Author | CC BY 4.0 |';
    expect(() => parseCreditRows(md(bare), header, 'x.md')).toThrow(/not a \[title\]/);
  });

  it('throws when the file cell is not a backticked asset name', () => {
    const bad = '| a.png | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author | CC BY 4.0 |';
    expect(() => parseCreditRows(md(bad), header, 'x.md')).toThrow(/backticked/);
  });

  it('stops at the first line that is not a table row', () => {
    const twoTables = [
      '| File | Driver | Commons source | Author | Licence |',
      '|---|---|---|---|---|',
      good,
      '',
      '## Another table',
      '',
      '| File | What it is | What it is missing |',
      '|---|---|---|',
      '| `a.png` | a thing | another thing |',
    ].join('\n');
    expect(tableRows(twoTables, DRIVER_HEADER, 'x.md')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && mise exec -- pnpm test -- --run credits-data
```
Expected: FAIL — `Failed to resolve import "@/lib/credits"`.

- [ ] **Step 3: Write `frontend/lib/credits.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Build-time reader for the two asset credit files.
 *
 * `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` are the canonical record of who
 * made each committed photograph and logo and under what licence; `/credits` renders them so
 * the CC BY / CC BY-SA obligation on the headshots is discharged by a page a reader can
 * actually use rather than by a raw `.md` URL.
 *
 * Tables are matched by their **header row**, never by scanning for filenames. `logos/CREDITS.md`
 * carries a second table — `| File | What it is | What it is missing |` — whose rows also lead
 * with a backticked filename, so a naive scan finds 14 rows for 10 files.
 *
 * Nothing here is forgiving. A row that has drifted out of shape throws and fails the build,
 * because the failure mode that matters on an attribution page is silently rendering an empty
 * author. This is the opposite of the backend's "tools never raise" rule, which is about keeping
 * a degrading LLM pipeline alive and does not apply to reading a file we ship.
 */

export interface CreditRow {
  /** Bare filename as the markdown cites it, e.g. `george-russell.png`. */
  file: string;
  /** The "Driver" or "Team" column. */
  subject: string;
  /** Link text of the Commons source cell: the Commons file title. */
  sourceTitle: string;
  /** Link target of the Commons source cell. */
  sourceUrl: string;
  /** "Author" for photographs, "Attributed to" for public-domain logos. */
  author: string;
  licence: string;
}

export interface MarqueNote {
  file: string;
  whatItIs: string;
  whatItIsMissing: string;
}

const DRIVERS_CREDITS = join(process.cwd(), 'public', 'drivers', 'CREDITS.md');
const LOGOS_CREDITS = join(process.cwd(), 'public', 'logos', 'CREDITS.md');

const DRIVER_HEADER = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];
const LOGO_HEADER = ['File', 'Team', 'Commons source', 'Attributed to', 'Licence'];
const MARQUE_HEADER = ['File', 'What it is', 'What it is missing'];
const TERMS_HEADER = ['Licence', 'Terms'];

const FILE_CELL = /^`([a-z0-9-]+\.(?:png|svg))`$/;
/**
 * `.+` for the URL, anchored on the final `)`, because Commons titles carry literal
 * parentheses — `…_(cropped).jpg` — and `[^)]+` would truncate the href mid-URL.
 */
const LINK_CELL = /^\[(.+)\]\((https:\/\/.+)\)$/;
const SEPARATOR_CELL = /^:?-{3,}:?$/;

function isRow(line: string): boolean {
  return line.trimStart().startsWith('|');
}

/** A markdown row is `| a | b |`, so the split yields an empty first and last cell. */
function cells(line: string): string[] {
  const parts = line.split('|').map((cell) => cell.trim());
  return parts.slice(1, Math.max(parts.length - 1, 1));
}

/**
 * The rows of the one table in `markdown` whose header cells equal `header`, as trimmed cell
 * arrays. `where` names the file in error messages.
 */
export function tableRows(markdown: string, header: string[], where: string): string[][] {
  const lines = markdown.split('\n');
  const label = `| ${header.join(' | ')} |`;

  const headerIndex = lines.findIndex((line) => {
    if (!isRow(line)) return false;
    const found = cells(line);
    return found.length === header.length && found.every((cell, i) => cell === header[i]);
  });
  if (headerIndex === -1) throw new Error(`${where}: no table with header ${label}`);

  const separator = lines[headerIndex + 1] ?? '';
  if (!isRow(separator) || !cells(separator).every((cell) => SEPARATOR_CELL.test(cell))) {
    throw new Error(`${where}: header ${label} is not followed by a |---| separator`);
  }

  const rows: string[][] = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!isRow(line)) break;
    const row = cells(line);
    if (row.length !== header.length) {
      throw new Error(
        `${where}: ${label} row ${rows.length + 1} has ${row.length} cells, expected ${header.length}: ${line}`,
      );
    }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`${where}: table ${label} has no rows`);
  return rows;
}

/** `| file | subject | source | author | licence |` rows, validated. */
export function parseCreditRows(markdown: string, header: string[], where: string): CreditRow[] {
  return tableRows(markdown, header, where).map((row) => {
    const fileCell = row[0]!;
    const subject = row[1]!;
    const sourceCell = row[2]!;
    const author = row[3]!;
    const licence = row[4]!;

    const file = FILE_CELL.exec(fileCell);
    if (!file) {
      throw new Error(`${where}: file cell is not a backticked .png or .svg name: ${fileCell}`);
    }
    const link = LINK_CELL.exec(sourceCell);
    if (!link) {
      throw new Error(
        `${where}: ${fileCell} source is not a [title](https://…) link: ${sourceCell}`,
      );
    }
    if (!subject) throw new Error(`${where}: ${fileCell} has an empty subject`);
    if (!author) throw new Error(`${where}: ${fileCell} has an empty author`);
    if (!licence) throw new Error(`${where}: ${fileCell} has an empty licence`);

    return {
      file: file[1]!,
      subject,
      sourceTitle: link[1]!,
      sourceUrl: link[2]!,
      author,
      licence,
    };
  });
}

export function readDriverCredits(): CreditRow[] {
  return parseCreditRows(
    readFileSync(DRIVERS_CREDITS, 'utf8'),
    DRIVER_HEADER,
    'public/drivers/CREDITS.md',
  );
}

export function readLogoCredits(): CreditRow[] {
  return parseCreditRows(
    readFileSync(LOGOS_CREDITS, 'utf8'),
    LOGO_HEADER,
    'public/logos/CREDITS.md',
  );
}

export function readMarqueNotes(): MarqueNote[] {
  const where = 'public/logos/CREDITS.md';
  return tableRows(readFileSync(LOGOS_CREDITS, 'utf8'), MARQUE_HEADER, where).map((row) => {
    const fileCell = row[0]!;
    const whatItIs = row[1]!;
    const whatItIsMissing = row[2]!;

    const file = FILE_CELL.exec(fileCell);
    if (!file) {
      throw new Error(`${where}: marque note file cell is not a backticked name: ${fileCell}`);
    }
    if (!whatItIs || !whatItIsMissing) {
      throw new Error(`${where}: ${fileCell} marque note has an empty cell`);
    }
    return { file: file[1]!, whatItIs, whatItIsMissing };
  });
}

/**
 * Licence name → terms URL, from the "Licence texts" table.
 *
 * The cells are markdown autolinks (`<https://…>`), so the brackets come off. Not every licence
 * a row uses is in here: the driver rows say `CC0` where this table says `CC0 1.0`. That
 * disagreement lives in the source data and is left there — a licence with no entry renders as
 * plain text rather than a link.
 */
export function readLicenceTerms(): Map<string, string> {
  const where = 'public/drivers/CREDITS.md';
  const terms = new Map<string, string>();
  for (const row of tableRows(readFileSync(DRIVERS_CREDITS, 'utf8'), TERMS_HEADER, where)) {
    const name = row[0]!;
    const url = row[1]!.replace(/^</, '').replace(/>$/, '');
    if (!name) throw new Error(`${where}: licence terms row has an empty licence name`);
    if (!/^https:\/\//.test(url)) {
      throw new Error(`${where}: licence "${name}" has no https terms URL: ${row[1]}`);
    }
    terms.set(name, url);
  }
  return terms;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && mise exec -- pnpm test -- --run credits-data
```
Expected: PASS, 17 tests. If "reads ten logo credits" fails with 14, the header match is wrong — do not relax the test.

- [ ] **Step 5: Run the full gates**

```bash
cd frontend && mise exec -- pnpm test -- --run && mise exec -- pnpm typecheck && mise exec -- pnpm lint
```
Expected: 341 tests passing (324 + 17), typecheck and lint clean.

- [ ] **Step 6: Add the two CLAUDE.md notes**

In `CLAUDE.md`, immediately after the paragraph beginning `**The landing page composes, it doesn't contain.**`, insert:

```markdown
**The credit tables are matched by their header row, never by a filename scan.** `lib/credits.ts`
parses `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` at build time for `/credits`, and
`logos/CREDITS.md` carries a *second* table — `| File | What it is | What it is missing |` — whose
rows also lead with a backticked filename. A naive `` `*.svg` `` scan over that file finds **14
rows for 10 files**. `tests/credits-data.test.ts` asserts ten, which is the guard.

**`lib/credits.ts` throws on a malformed row, on purpose.** A short row, a missing header, an
empty author or a source cell that is not a markdown link fails `pnpm build`. The "tools never
raise" convention is about keeping a degrading LLM pipeline alive and does not extend to a
build-time read of a file we ship: silently rendering an empty author is an undischarged licence
obligation on a public page. Two source-data quirks are deliberately *not* treated as errors —
the driver rows say `CC0` where the licence-terms table says `CC0 1.0`, so that one licence
renders unlinked, and Commons source URLs carry literal parentheses, which is why the link
pattern is greedy rather than `[^)]+`.
```

- [ ] **Step 7: Commit**

```bash
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git add frontend/lib/credits.ts frontend/tests/credits-data.test.ts CLAUDE.md
git commit -m "Parse the credit tables by header row, and throw on drift

/credits is about to render these rows, so the parse has to be exact. Matching
on the header row rather than on backticked filenames is the whole design:
logos/CREDITS.md has a second table whose four rows also lead with a filename,
so a scan finds 14 rows for 10 files.

Everything malformed throws and fails the build. An attribution page that
silently renders an empty author is an undischarged obligation, which is worse
than a red build. Two quirks in the source data stay quirks: CC0 vs CC0 1.0
leaves one licence unlinked, and Commons URLs carry literal parentheses."
```

---

### Task 2: `AttributionTable` — the thumbnail-led table

**Files:**
- Create: `frontend/components/credits/attribution-table.tsx`
- Create: `frontend/tests/attribution-table.test.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `CreditRow`, `readDriverCredits`, `readLogoCredits`, `readLicenceTerms` from `@/lib/credits` (Task 1). `cn` from `@/lib/utils`. `restingTextNeutrals` from `@/tests/zinc` and `contrastRatio`, `DARK_BG`, `MIN_CONTRAST` from `@/lib/team-utils` — all three already exist, extend nothing.
- Produces: `AttributionTable(props: { rows: CreditRow[]; basePath: string; variant: 'photo' | 'logo'; subjectLabel: string; authorLabel: string; caption: string; licenceTerms?: Map<string, string> })`, a named export.

**Context the implementer needs:**

**The two variants size their thumbnail differently and this is not a style choice.** The committed logos are horizontal lockups running from 0.91:1 (Mercedes) to **9.48:1** (the Aston Martin wordmark). `object-contain` inside a 32px square draws that wordmark ~3.4px tall — less legible than no thumbnail. Logos are therefore height-driven (20px tall, `width: auto`, `max-w-[72px]`), photographs are 32px squares with `object-cover`. `components/teams/team-logo.tsx` documents the same rule at length; obey it rather than rediscovering it.

**`next/image` renders two different `src` shapes here, and a test that assumes one will fail on the other.** Next's default loader special-cases SVG (`get-img-props.js:234`: `src.endsWith('.svg') && !config.dangerouslyAllowSVG` → served as-is), so a logo's `src` stays `/logos/alpine.svg` while a photograph's becomes `/_next/image?url=%2Fdrivers%2Fgeorge-russell.png&w=64&q=75`. The test below normalises both. No `next.config.js` change is needed — `TeamLogo` already does exactly this on `/teams`.

Thumbnails take `alt=""`: the subject cell beside them is the row's accessible name, and a duplicate would be announced twice.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/attribution-table.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AttributionTable } from '@/components/credits/attribution-table';
import { readDriverCredits, readLicenceTerms, readLogoCredits } from '@/lib/credits';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function assets(dir: string, ext: string): string[] {
  return readdirSync(join(process.cwd(), 'public', dir))
    .filter((f) => f.endsWith(ext))
    .sort();
}

/**
 * The `src` a thumbnail actually renders with, normalised.
 *
 * `next/image` serves SVG as-is (its default loader refuses to proxy one without
 * `dangerouslyAllowSVG`) but routes a PNG through `/_next/image?url=…`, so the two variants
 * produce different attribute shapes and a raw string compare passes for one and fails for the
 * other.
 */
function thumbnailSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img'))
    .map((img) => {
      const src = img.getAttribute('src') ?? '';
      const proxied = /\/_next\/image\?url=([^&]+)/.exec(src);
      return proxied ? decodeURIComponent(proxied[1]!) : src;
    })
    .sort();
}

function renderDrivers() {
  return render(
    <AttributionTable
      rows={readDriverCredits()}
      basePath="/drivers"
      variant="photo"
      subjectLabel="Driver"
      authorLabel="Author"
      caption="Driver photograph credits."
      licenceTerms={readLicenceTerms()}
    />,
  );
}

function renderLogos() {
  return render(
    <AttributionTable
      rows={readLogoCredits()}
      basePath="/logos"
      variant="logo"
      subjectLabel="Team"
      authorLabel="Attributed to"
      caption="Team logo credits."
    />,
  );
}

describe('AttributionTable', () => {
  it('renders a thumbnail for every committed headshot', () => {
    const { container } = renderDrivers();
    expect(thumbnailSrcs(container)).toEqual(assets('drivers', '.png').map((f) => `/drivers/${f}`));
  });

  it('renders a thumbnail for every committed logo', () => {
    const { container } = renderLogos();
    expect(thumbnailSrcs(container)).toEqual(assets('logos', '.svg').map((f) => `/logos/${f}`));
  });

  // The subject cell beside the thumbnail is the row's accessible name; a duplicate alt would be
  // announced twice.
  it('leaves the thumbnails out of the accessibility tree', () => {
    const { container } = renderDrivers();
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('alt')).toBe('');
    }
  });

  it('shows each row its author verbatim, derivative-work credits included', () => {
    renderDrivers();
    expect(
      screen.getByText('Original: Steffen Prößdorf; Derivative work: Mb2437'),
    ).toBeInTheDocument();
  });

  it('links a source to Commons under the full file title as its accessible name', () => {
    renderDrivers();
    const link = screen.getByRole('link', { name: /^Alonso-68 \(24710447098\)\.jpg$/ });
    expect(link).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Alonso-68_(24710447098).jpg',
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('links a licence to its terms when they are known', () => {
    renderDrivers();
    const links = screen.getAllByRole('link', { name: 'CC BY-SA 4.0' });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('renders a licence with no known terms as plain text', () => {
    renderDrivers();
    expect(screen.getByText('CC0')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'CC0' })).toBeNull();
  });

  it('leaves every public-domain logo licence unlinked', () => {
    renderLogos();
    expect(screen.getAllByText('Public domain')).toHaveLength(10);
    expect(screen.queryByRole('link', { name: 'Public domain' })).toBeNull();
  });

  it('is a real table: a caption and column-scoped headers', () => {
    const { container } = renderDrivers();
    expect(container.querySelector('caption')?.textContent).toBe('Driver photograph credits.');
    const headers = Array.from(container.querySelectorAll('th'));
    expect(headers).toHaveLength(5);
    for (const th of headers) expect(th).toHaveAttribute('scope', 'col');
    expect(headers.map((th) => th.textContent)).toEqual([
      'Asset',
      'Driver',
      'Author',
      'Licence',
      'Source',
    ]);
  });

  it('renames the subject and author columns for logos', () => {
    const { container } = renderLogos();
    expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      'Asset',
      'Team',
      'Attributed to',
      'Licence',
      'Source',
    ]);
  });

  // Same bar the rest of the branch is held to: every resting neutral clears AA on zinc-950.
  it('keeps every text run above the AA contrast bar', () => {
    const { container } = renderDrivers();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  // f1-red is 4.12:1 on zinc-950 — it passes only the large-text bar, and nothing in a table is
  // large text.
  it('puts no f1-red anywhere in the table', () => {
    const { container } = renderDrivers();
    expect(container.querySelectorAll('[class*="text-f1-red"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && mise exec -- pnpm test -- --run attribution-table
```
Expected: FAIL — `Failed to resolve import "@/components/credits/attribution-table"`.

- [ ] **Step 3: Write `frontend/components/credits/attribution-table.tsx`**

```tsx
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type CreditRow } from '@/lib/credits';

/**
 * The thumbnail-led credit table on `/credits`.
 *
 * Pure presentation over `CreditRow`s: it reads nothing, fetches nothing, and knows nothing about
 * where the rows came from. That split is what makes the credits testable at all — the page above
 * it is a server component doing file I/O, and this is the part with markup worth asserting on.
 *
 * A real `<table>`, not a div grid: five columns of tabular data whose header association is the
 * only thing that makes an author cell mean "author" to a screen reader.
 */

/** Small-caps tracked label, shared with the page. */
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const CELL = 'border-t border-zinc-800 py-2 pr-3 align-middle text-zinc-300';
const SMALL_CELL = cn(CELL, 'text-[10px] sm:text-xs');
/** The link treatment /teams' credits footer already uses. */
const LINK =
  'rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500';

/**
 * Photographs are square crops, so a square box is right. Logos are horizontal lockups running
 * from 0.91:1 to 9.48:1 (the Aston Martin wordmark) — `object-contain` in a 32px square would
 * draw that one ~3.4px tall, so they are sized by height with a wide max-width instead. Same
 * rule, and the same reason, as `components/teams/team-logo.tsx`.
 */
const THUMBNAIL = {
  photo: {
    column: 'w-[44px]',
    width: 32,
    height: 32,
    image: 'h-8 w-8 rounded object-cover',
    tile: '',
  },
  logo: {
    column: 'w-[88px]',
    width: 72,
    height: 20,
    image: 'h-5 w-auto max-w-[72px] object-contain',
    tile: 'rounded bg-zinc-900 px-2 py-1',
  },
} as const;

interface AttributionTableProps {
  rows: CreditRow[];
  /** `/drivers` or `/logos` — prefixed to `row.file` for the thumbnail src. */
  basePath: string;
  variant: 'photo' | 'logo';
  /** Heading over the subject column: "Driver" or "Team". */
  subjectLabel: string;
  /** Heading over the author column: "Author" or "Attributed to". */
  authorLabel: string;
  /** Visually hidden `<caption>`, so the table is announced as what it is. */
  caption: string;
  /**
   * Licence name → terms URL. Passed for the photograph table; omitted for the logo table, whose
   * rows are all `Public domain` with no terms row to point at. A licence that is absent from the
   * map renders as plain text.
   */
  licenceTerms?: Map<string, string>;
}

export function AttributionTable({
  rows,
  basePath,
  variant,
  subjectLabel,
  authorLabel,
  caption,
  licenceTerms,
}: AttributionTableProps) {
  const thumbnail = THUMBNAIL[variant];

  return (
    <table className="w-full table-fixed border-collapse text-left text-xs sm:text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(thumbnail.column, LABEL, 'pb-2')}>
            <span className="sr-only">Asset</span>
          </th>
          <th scope="col" className={cn('w-[30%]', LABEL, 'pb-2')}>
            {subjectLabel}
          </th>
          <th scope="col" className={cn('w-[24%]', LABEL, 'pb-2')}>
            {authorLabel}
          </th>
          <th scope="col" className={cn('w-[18%]', LABEL, 'pb-2')}>
            Licence
          </th>
          <th scope="col" className={cn(LABEL, 'pb-2')}>
            Source
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const terms = licenceTerms?.get(row.licence);
          return (
            <tr key={row.file}>
              <td className={CELL}>
                <span className={cn('inline-flex items-center', thumbnail.tile)}>
                  {/* alt="" on purpose: the subject cell beside this is the row's accessible
                      name, and a duplicate would be announced twice. */}
                  <Image
                    src={`${basePath}/${row.file}`}
                    alt=""
                    width={thumbnail.width}
                    height={thumbnail.height}
                    className={thumbnail.image}
                  />
                </span>
              </td>
              <td className={cn(CELL, 'break-words')}>{row.subject}</td>
              <td className={cn(SMALL_CELL, 'break-words')}>{row.author}</td>
              <td className={SMALL_CELL}>
                {terms ? (
                  <a href={terms} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {row.licence}
                  </a>
                ) : (
                  row.licence
                )}
              </td>
              <td className={SMALL_CELL}>
                {/* The Commons titles run past 90 characters, so they are the accessible name
                    rather than the column text — nothing legible fits five columns at 390px. */}
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={row.sourceTitle}
                  className={LINK}
                >
                  Commons
                  <span aria-hidden="true"> ↗</span>
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && mise exec -- pnpm test -- --run attribution-table
```
Expected: PASS, 13 tests. Two failures are expected to need a look, not a test edit:
- a `th` textContent mismatch means the `sr-only` "Asset" span was dropped;
- a contrast failure names the shade — check it against `tests/zinc.ts`'s `ZINC` map, and if the map throws for a shade you introduced, prefer `zinc-300`/`zinc-400` over extending it.

- [ ] **Step 5: Run the full gates**

```bash
cd frontend && mise exec -- pnpm test -- --run && mise exec -- pnpm typecheck && mise exec -- pnpm lint
```
Expected: 354 tests passing (341 + 13), typecheck and lint clean.

- [ ] **Step 6: Add the CLAUDE.md bullet**

In `CLAUDE.md`, under `### Frontend tests`, append this bullet to the existing list (after the `tests/setup.ts` stubs bullet):

```markdown
- **`next/image` renders two different `src` shapes, and a test that assumes one fails on the
  other.** Next's default loader refuses to proxy an SVG without `dangerouslyAllowSVG`, so
  `/logos/alpine.svg` stays literal while `/drivers/x.png` becomes
  `/_next/image?url=%2Fdrivers%2Fx.png&w=64&q=75`. `tests/attribution-table.test.tsx` normalises
  both before comparing. `/credits`' page component is *synchronous* despite being a server
  component doing file I/O, which is the only reason RTL can render it at all — an `async` server
  component cannot be rendered by RTL, and that is why the data, the table and the page are three
  units.
```

- [ ] **Step 7: Commit**

```bash
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git add frontend/components/credits/attribution-table.tsx frontend/tests/attribution-table.test.tsx CLAUDE.md
git commit -m "Add the thumbnail-led attribution table

Pure presentation over CreditRow: the page above it does file I/O, so this is
the part with markup worth asserting on. A real table with a caption and
scope=\"col\" headers, because an author cell only means \"author\" to a screen
reader through its header.

Logos are sized by height, not squeezed into the photographs' 32px square. The
committed marks run to 9.48:1, which object-contain would draw 3.4px tall in a
square — the rule team-logo.tsx already documents.

Licence names link to their terms when the source file lists them; CC0 and the
ten public-domain logos render as text."
```

---

### Task 3: The page, and the link that reaches it

**Files:**
- Rewrite: `frontend/app/credits/page.tsx`
- Create: `frontend/tests/credits-page.test.tsx`
- Modify: `frontend/components/teams/teams-comparison-grid.tsx:174-193`
- Modify: `frontend/tests/driver-credits.test.tsx:91`

**Interfaces:**
- Consumes: `AttributionTable` (Task 2); `readDriverCredits`, `readLogoCredits`, `readMarqueNotes`, `readLicenceTerms`, `MarqueNote` (Task 1).
- Produces: `/credits` with stable fragment ids `#driver-photographs` and `#team-logos`. `#driver-photographs` is what the `/teams` footer links to and must not move.

**Context the implementer needs:**

Page order is fixed: intro → **Driver photographs** → **Team logos** (credit table, then the four marque notes) → 3D model → Technologies → Data sources → Licence → back link.

The two prose notes in `logos/CREDITS.md` — Racing Bulls has no freely licensed vector, and `alpine.svg` had one `fill` attribute repainted for dark backgrounds — get **one summary line each** plus a link to the raw file. Do not build a markdown prose renderer for two paragraphs.

The four marque notes render **inline here**, not through `AttributionTable`: they have no author, licence, source or thumbnail, only *what the mark is* and *what it is missing*.

The existing page's content is right except for styling. Keep "Next.js 14" and "Gemini 3.6 Flash" — both accurate. The 3D model's licence URL moves from `http://` to `https://`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/credits-page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import CreditsPage from '@/app/credits/page';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function count(dir: string, ext: string): number {
  return readdirSync(join(process.cwd(), 'public', dir)).filter((f) => f.endsWith(ext)).length;
}

/**
 * `CreditsPage` is a server component, but a **synchronous** one — it reads the credit files with
 * `readFileSync` rather than awaiting anything — so RTL can render it. An async server component
 * could not be rendered here at all, which is why the parser and the table are separate units.
 */
describe('/credits', () => {
  it('carries the fragment the /teams footer links to', () => {
    const { container } = render(<CreditsPage />);
    expect(container.querySelector('#driver-photographs')).not.toBeNull();
    expect(container.querySelector('#team-logos')).not.toBeNull();
  });

  it('shows a thumbnail for every committed photograph and logo', () => {
    const { container } = render(<CreditsPage />);
    expect(container.querySelectorAll('img')).toHaveLength(
      count('drivers', '.png') + count('logos', '.svg'),
    );
  });

  it('names what each marque mark is missing', () => {
    render(<CreditsPage />);
    expect(screen.getByText('the Ferrari wordmark')).toBeInTheDocument();
    expect(screen.getByText('the prancing-horse shield')).toBeInTheDocument();
  });

  it('summarises the two prose notes rather than rendering the markdown', () => {
    render(<CreditsPage />);
    expect(screen.getByText(/no freely licensed vector/i)).toBeInTheDocument();
    expect(screen.getByText(/repainted for a dark background/i)).toBeInTheDocument();
  });

  it('still links both raw source files', () => {
    const { container } = render(<CreditsPage />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/drivers/CREDITS.md');
    expect(hrefs).toContain('/logos/CREDITS.md');
  });

  it('credits the 3D model with its author and licence', () => {
    render(<CreditsPage />);
    expect(screen.getByRole('link', { name: 'Nimaxo' })).toBeInTheDocument();
    // getAllByRole, not getByRole: the photograph table links its own CC BY 4.0 rows to the same
    // terms URL, so this name is not unique on the page — and every one of them must agree.
    const licences = screen.getAllByRole('link', { name: 'CC BY 4.0' });
    expect(licences.length).toBeGreaterThan(0);
    for (const link of licences) {
      expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    }
  });

  // f1-red is 4.12:1 on zinc-950: it clears only the 3:1 large-text bar, so every use of it has
  // to be inside something set at text-2xl or larger.
  it('uses f1-red only on large headings', () => {
    const { container } = render(<CreditsPage />);
    const reds = Array.from(container.querySelectorAll('[class*="text-f1-red"]'));
    expect(reds.length).toBeGreaterThan(0);
    for (const el of reds) {
      expect(el.closest('.text-2xl, .text-4xl'), el.textContent ?? '').not.toBeNull();
    }
  });

  it('keeps every neutral text run above the AA contrast bar', () => {
    const { container } = render(<CreditsPage />);
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && mise exec -- pnpm test -- --run credits-page
```
Expected: FAIL — no `#driver-photographs`, and 1 image rather than 32.

- [ ] **Step 3: Rewrite `frontend/app/credits/page.tsx`**

Replace the file's entire contents:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { AttributionTable } from '@/components/credits/attribution-table';
import {
  readDriverCredits,
  readLicenceTerms,
  readLogoCredits,
  readMarqueNotes,
} from '@/lib/credits';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Credits & Attributions',
  description:
    'Attribution for the photographs, logos, 3D model, data and technologies used in the F1 Briefing Agent.',
};

/** The link treatment /teams uses. */
const LINK =
  'rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const PROSE = 'max-w-3xl text-sm leading-relaxed text-zinc-400';
/** f1-red is 4.12:1 on zinc-950 — text-2xl and up only. */
const HEADING = 'text-2xl font-bold text-f1-red';
const RULE = 'mb-6 h-px w-16 bg-f1-red';
const NOTE_CELL = 'border-t border-zinc-800 py-2 pr-3 align-top text-zinc-300';

/**
 * Attribution for everything on this site that came from somewhere else.
 *
 * The credit rows are parsed out of `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` at
 * build time, so those files stay the canonical record and this page cannot drift from them: a
 * row that loses its author fails the build rather than rendering blank. `#driver-photographs` is
 * linked from /teams' footer and must keep that id.
 *
 * Synchronous on purpose — `readFileSync`, not `await`. It costs nothing at build time and it
 * keeps the page renderable by React Testing Library.
 */
export default function CreditsPage() {
  const drivers = readDriverCredits();
  const logos = readLogoCredits();
  const marques = readMarqueNotes();
  const licenceTerms = readLicenceTerms();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <h1 className="mb-3 text-4xl font-bold">
          <span className="text-f1-red">Credits</span> &amp; Attributions
        </h1>
        <p className={cn('mb-16', PROSE)}>
          Everything on this site that came from somewhere else, with its author, its licence and a
          route back to the original.
        </p>

        <section id="driver-photographs" className="mb-16 scroll-mt-24">
          <h2 className={cn('mb-3', HEADING)}>Driver photographs</h2>
          <div className={RULE} />
          <p className={cn('mb-6', PROSE)}>
            All {drivers.length} headshots are photographs hosted on Wikimedia Commons. Most are CC
            BY or CC BY-SA, which oblige attribution — and because the files shipped here are
            downscaled to a 400px longest edge and transcoded from the originals, CC BY-SA&rsquo;s
            share-alike attaches as well. This table is that attribution;{' '}
            <a href="/drivers/CREDITS.md" className={LINK}>
              the source file
            </a>{' '}
            carries the same rows.
          </p>
          <AttributionTable
            rows={drivers}
            basePath="/drivers"
            variant="photo"
            subjectLabel="Driver"
            authorLabel="Author"
            caption="Driver photograph credits: thumbnail, driver, author, licence and Commons source."
            licenceTerms={licenceTerms}
          />
        </section>

        <section id="team-logos" className="mb-16 scroll-mt-24">
          <h2 className={cn('mb-3', HEADING)}>Team logos</h2>
          <div className={RULE} />
          <p className={cn('mb-6', PROSE)}>
            Every logo is a vector mark hosted on Wikimedia Commons under a public-domain tag — the
            designs fall below the threshold of originality, so none of them obliges attribution.
            They are still registered trademarks, used here only to identify the team being written
            about. The attribution column names the rights-holding marque, not an illustrator.
          </p>
          <AttributionTable
            rows={logos}
            basePath="/logos"
            variant="logo"
            subjectLabel="Team"
            authorLabel="Attributed to"
            caption="Team logo credits: thumbnail, team, rights holder, licence and Commons source."
          />

          <h3 className={cn('mb-2 mt-12', LABEL)}>Marque marks standing in for team lockups</h3>
          <p className={cn('mb-4', PROSE)}>
            Four files are an authentic public-domain mark of the correct company, but narrower
            than the full Formula 1 team lockup, for which no free vector exists.
          </p>
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <caption className="sr-only">
              Logo files that show a marque mark rather than a full Formula 1 team lockup.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={cn('w-[28%] pb-2', LABEL)}>
                  File
                </th>
                <th scope="col" className={cn('w-[36%] pb-2', LABEL)}>
                  What it is
                </th>
                <th scope="col" className={cn('pb-2', LABEL)}>
                  What it is missing
                </th>
              </tr>
            </thead>
            <tbody>
              {marques.map((note) => (
                <tr key={note.file}>
                  <td className={cn(NOTE_CELL, 'font-mono text-[11px]')}>{note.file}</td>
                  <td className={NOTE_CELL}>{note.whatItIs}</td>
                  <td className={cn(NOTE_CELL, 'pr-0')}>{note.whatItIsMissing}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={cn('mt-6', PROSE)}>
            Two more notes live in{' '}
            <a href="/logos/CREDITS.md" className={LINK}>
              the source file
            </a>
            : Visa Cash App Racing Bulls has no freely licensed vector on Commons at all, so the
            team pages render a lettered monogram instead; and <code>alpine.svg</code> has a single
            attribute changed — Commons hosts the near-black variant drawn for light backgrounds,
            and its ink is repainted for a dark background here, leaving the shapes and accent
            colours untouched.
          </p>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>3D model</h2>
          <div className={RULE} />
          <p className={PROSE}>
            <a
              href="https://skfb.ly/oWL8J"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              &ldquo;F1 2026 Release Car&rdquo;
            </a>{' '}
            by{' '}
            <a
              href="https://sketchfab.com/Nimaxo"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Nimaxo
            </a>
            , hosted on Sketchfab and licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              CC BY 4.0
            </a>
            .
          </p>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Technologies</h2>
          <div className={RULE} />
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className={cn('mb-3', LABEL)}>Frontend</h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li>React &amp; Next.js 14</li>
                <li>TypeScript</li>
                <li>Three.js / React Three Fiber</li>
                <li>Tailwind CSS</li>
              </ul>
            </div>
            <div>
              <h3 className={cn('mb-3', LABEL)}>Backend</h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li>Python &amp; FastAPI</li>
                <li>LangChain &amp; LangGraph</li>
                <li>Gemini 3.6 Flash (Google)</li>
                <li>FastF1</li>
                <li>Tavily API</li>
                <li>OpenWeather API</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Data sources</h2>
          <div className={RULE} />
          <dl className="space-y-3 text-sm text-zinc-400">
            <div>
              <dt className="inline font-semibold text-zinc-300">FastF1 — </dt>
              <dd className="inline">schedules, session timing and race results</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-zinc-300">Tavily — </dt>
              <dd className="inline">web search and F1 news aggregation</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-zinc-300">OpenWeather — </dt>
              <dd className="inline">weather forecasts for race locations</dd>
            </div>
          </dl>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Licence</h2>
          <div className={RULE} />
          <p className={cn('mb-3', PROSE)}>This project is licensed under the MIT License.</p>
          <p className={PROSE}>
            The third-party assets are not: the 3D model is CC BY 4.0, the driver photographs are
            CC BY, CC BY-SA, CC0 or OGL 3 as listed above, and the team logos are public-domain
            marks that remain registered trademarks of their owners.
          </p>
        </section>

        <div className="border-t border-zinc-800 pt-10 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg bg-f1-red px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            ← Back to Briefing Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && mise exec -- pnpm test -- --run credits-page
```
Expected: PASS, 8 tests. If "uses f1-red only on large headings" fails, the failure message prints the offending element's text — the fix is to move the colour onto the heading, never to widen the assertion.

- [ ] **Step 5: Point the /teams footer at the page**

In `frontend/components/teams/teams-comparison-grid.tsx`, replace the comment and `href` in the footer block (lines 174–193):

```tsx
      {/* Photograph credits. The page publicly displays 22 driver headshots, 20 of which are
          CC BY or CC BY-SA and so oblige attribution — and because the committed PNGs are
          downscaled and transcoded from the Commons originals, BY-SA's share-alike attaches
          too. `/credits` renders `public/drivers/CREDITS.md` as a real table, thumbnail by
          thumbnail; the raw file stays canonical and is linked from there. A link straight to
          the `.md` did not discharge "provide attribution in any reasonable manner based on the
          medium" — the browser renders it as unstyled text or downloads it. This is the last
          section of /teams, so the link lives here: small, but genuinely visible and keyboard
          reachable. */}
      <footer className="mt-14 border-t border-zinc-900 pt-6">
        <p className="max-w-2xl text-[11px] leading-relaxed text-zinc-400">
          Driver photographs sourced from Wikimedia Commons and used under CC BY / CC BY-SA;
          resized and transcoded from the originals.{' '}
          <a
            href="/credits#driver-photographs"
            className="rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            Full attribution and licence details
          </a>
          .
        </p>
      </footer>
```

- [ ] **Step 6: Update the one assertion that pins the old href**

In `frontend/tests/driver-credits.test.tsx`, line 91 only — leave the other five invariants exactly as they are:

```tsx
    expect(link).toHaveAttribute('href', '/credits#driver-photographs');
```

- [ ] **Step 7: Run the full gates**

```bash
cd frontend && mise exec -- pnpm test -- --run && mise exec -- pnpm typecheck && mise exec -- pnpm lint
```
Expected: 362 tests passing (354 + 8), typecheck and lint clean. All six `driver-credits` invariants still pass.

- [ ] **Step 8: Add OpenF1 to Data sources — only if the backend uses it**

The spec asks for this row, but OpenF1 is absent from this branch and from `origin/main`; it exists only on the unmerged `feat/openf1-results-migration`. Check, then act:

```bash
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git grep -il openf1 -- backend | head
```

- **Output empty (expected):** change nothing. Leave the three sources as written and say so in the task report.
- **Output non-empty:** insert this entry into the `<dl>` in `app/credits/page.tsx` immediately after the FastF1 entry, and narrow FastF1's own description to `schedules and pre-2023 session results`:

```tsx
            <div>
              <dt className="inline font-semibold text-zinc-300">OpenF1 — </dt>
              <dd className="inline">race results, classifications and championship standings</dd>
            </div>
```

- [ ] **Step 9: Commit**

```bash
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git add frontend/app/credits/page.tsx frontend/tests/credits-page.test.tsx frontend/components/teams/teams-comparison-grid.tsx frontend/tests/driver-credits.test.tsx
git commit -m "Make /credits the attribution page, and link /teams at it

/teams' footer pointed at /drivers/CREDITS.md, which the browser renders as
unstyled text or downloads — a weak reading of \"attribution in any reasonable
manner based on the medium\" for 22 publicly displayed headshots. It now points
at /credits#driver-photographs, where the same rows render as a thumbnail-led
table beside the logos and the 3D model.

The page is restyled to /teams' language throughout: zinc-950 ground, zinc-400
body, zinc-300 links, small-caps labels, f1-red confined to headings and rules
because it measures 4.12:1 and clears only the large-text bar.

The markdown files stay canonical and stay linked. The four marque notes render
inline rather than through the credit table — they have no author, licence or
source, only what the mark is and what it is missing."
```

---

### Task 4: Browser verification

**Files:** none — this task changes no code unless it finds something.

**Interfaces:**
- Consumes: `/credits` as shipped by Task 3, served by the dev server already running on :3000.
- Produces: measured evidence at three viewports, or a defect list.

**Context the implementer needs:**

**A green `pnpm test` is not evidence for anything visual.** This branch shipped a scroll spy that never tracked scroll past 290 tests and four review passes, and three separate contrast tests measured the right colour against the wrong background and passed while the page failed. jsdom lays nothing out, so the logo aspect-ratio rule and the five-column layout at 390px have never actually been checked when this task starts.

Environment traps, each of which has already cost time on this branch:
- `export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"` first — `agent-browser` is installed globally but still needs node on `PATH`.
- **zsh does not word-split unquoted expansions.** `AB="agent-browser --flag"; $AB open …` looks for a command literally named `agent-browser --flag`. Use a shell function if you want an alias.
- **`set viewport` must come before `open`/`reload`**, and the probe must assert `[innerWidth, innerHeight]` itself. A sweep that reports identical numbers at every width never changed viewport.
- **Never pipe a long measurement through `head`** — SIGPIPE kills the script mid-run and the output looks merely short. Redirect to a file under `/private/tmp/claude-501/.../scratchpad/`, then read the file.
- **Element screenshots come back all black here.** Use viewport or `--full`, and always pass an **absolute** output path: `agent-browser`'s daemon cwd is not this worktree, and a stray `shot-test.png` landed in the repo root that way.
- **axe reports "background could not be determined" as *incomplete*, not as a violation.** Read the incomplete list; it is not a pass.

- [ ] **Step 1: Confirm the server and the CLI**

```bash
export PATH="/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin:$PATH"
curl -so /dev/null -w '%{http_code}\n' http://localhost:3000/credits   # expect 200
agent-browser --help > /private/tmp/claude-501/-Users-lawrencecrasto-Documents-personal-f1/1c25a90a-fb67-4c98-9032-a8f6e83cb0c8/scratchpad/ab-help.txt
```
Read `ab-help.txt` and use its exact subcommand and flag spellings for the steps below. Do not start a second dev server; if `/credits` is not 200, say so and stop.

- [ ] **Step 2: Sweep the three viewports**

For each of `1440 900`, `1152 800`, `390 844`, in that order: set the viewport, open `http://localhost:3000/credits`, then run one probe that writes to a file. The probe must report, in a single JSON blob:

```js
JSON.stringify({
  viewport: [window.innerWidth, window.innerHeight],
  overflow: [document.documentElement.scrollWidth, window.innerWidth],
  images: Array.from(document.images).length,
  painted: Array.from(document.images).filter((i) => i.naturalWidth > 0).length,
  shortestLogo: Math.min(
    ...Array.from(document.images)
      .filter((i) => i.currentSrc.includes('/logos/'))
      .map((i) => Math.round(i.getBoundingClientRect().height)),
  ),
  sections: ['driver-photographs', 'team-logos'].map((id) => !!document.getElementById(id)),
})
```

Pass conditions, all four:

| Measurement | Expected |
|---|---|
| `viewport` | the width and height just set — **different numbers at each step** |
| `overflow` | `scrollWidth <= innerWidth`. The five-column table at 390px exists to satisfy this |
| `images` / `painted` | 32 and 32 |
| `shortestLogo` | ≥ 16 — this is the aspect-ratio rule, and jsdom can never check it |

- [ ] **Step 3: Run axe at each viewport**

Run the `a11y` subcommand at all three viewports, each writing to its own absolute path under the scratchpad. Then read all three files.

Expected: **zero violations**. Read the *incomplete* entries too and account for each one — text over the page's plain `bg-zinc-950` should not produce any, so an incomplete here means something is layering behind the table that the jsdom contrast tests cannot see.

- [ ] **Step 4: Walk the link that discharges the obligation**

Open `http://localhost:3000/teams`, click the footer's "Full attribution and licence details", and assert after navigation:

```js
JSON.stringify({
  url: location.href,
  headingInView: document.getElementById('driver-photographs')?.getBoundingClientRect().top,
})
```

Expected: `url` ends `/credits#driver-photographs`, and `headingInView` is a small non-negative number — the section is at the top of the viewport, not scrolled under the nav.

- [ ] **Step 5: Screenshot the evidence**

One full-page screenshot per viewport, absolute paths under the scratchpad. Look at them: the thumbnails must read as photographs and wordmarks, the five columns must not collide at 390px, and no cell text may be clipped.

- [ ] **Step 6: Report, and fix only what was found**

Write the four measurements and the axe counts into the task report as numbers, not adjectives. If any pass condition failed, fix the cause and re-run the sweep from Step 2 — a failing measurement is never resolved by loosening a threshold. Any fix gets its own commit with the measurement in the message.

- [ ] **Step 7: Final gates and push**

```bash
cd frontend && mise exec -- pnpm test -- --run && mise exec -- pnpm typecheck && mise exec -- pnpm lint
cd /Users/lawrencecrasto/Documents/personal/f1/.claude/worktrees/teams-column-roles
git status --porcelain   # expect clean
git push
```

Do **not** run `pnpm build` — the dev server holds `.next`. If a production build is wanted, stop the dev server first and say so.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Decision 1 — fold into `/credits` | 3 |
| Decision 2 — restyle the whole page | 3 |
| Decision 3 — thumbnail-led table | 2 |
| Decision 4 — parse markdown at build | 1 |
| Decision 5 — files stay in `public/`, link moves | 3 (Steps 3, 5) |
| `lib/credits.ts` + header-row matching | 1 |
| Error handling: throws at build | 1 (Steps 1, 3) |
| `AttributionTable` props and columns | 2 |
| Page order, ids, marque table, prose notes | 3 |
| Data sources adds OpenF1 | 3 Step 8, **guarded** — absent from this branch and `origin/main`; see the deviation note |
| Restyle tokens, `f1-red` rule | Global Constraints; asserted in 2 and 3 |
| `driver-credits.test.tsx:91` | 3 Step 6 |
| Parser tests, table tests, contrast bar via `restingTextNeutrals` | 1, 2, 3 |
| Browser: three viewports, axe, overflow, thumbnails paint, footer link | 4 |
| CLAUDE.md notes | 1 Step 6, 2 Step 6 |

**Placeholder scan:** no TBD/TODO, no "add error handling", no "similar to Task N" — the Commons-source regex, the throw messages, the full page body and every test are written out. The only deliberately open value is `agent-browser`'s exact flag spelling, which Task 4 Step 1 resolves from `--help` before use rather than guessing.

**Type consistency:** `CreditRow` fields (`file`, `subject`, `sourceTitle`, `sourceUrl`, `author`, `licence`) and `MarqueNote` fields (`file`, `whatItIs`, `whatItIsMissing`) are used with those exact names in Tasks 2 and 3. `licenceTerms` is `Map<string, string>` in all three tasks. `readDriverCredits` / `readLogoCredits` / `readMarqueNotes` / `readLicenceTerms` are spelled identically everywhere. `variant` is `'photo' | 'logo'` in both the component and its test.

**One spec assumption corrected:** the spec says the page gets no unit test because RTL cannot render an async server component. The page is synchronous (`readFileSync`), so RTL *can* render it, and Task 3 takes that smoke test. The three-unit split still stands on its own merits and is unchanged.
