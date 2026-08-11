# /credits attribution page — design

**Date:** 2026-08-11
**Status:** Approved in brainstorming, written up for review
**Branch:** `feat/teams-navigation-and-perf`
**Baseline:** `1f32b0f`, 324 tests passing across 24 files, typecheck and lint clean
**Scope:** `frontend/app/credits/`, one new `frontend/lib/` module, one new
`frontend/components/credits/` component, and the one footer link on `/teams` that points at the
raw markdown today

## Why this spec exists

`/teams`' last section links to [`/drivers/CREDITS.md`](../../../frontend/public/drivers/CREDITS.md)
([`teams-comparison-grid.tsx:186`](../../../frontend/components/teams/teams-comparison-grid.tsx)).
The browser either renders that as unstyled plain text or downloads it. The user's words: *"this
is ugly, lets have a page for this"*.

It is not a cosmetic problem. That file is what discharges a **CC BY / CC BY-SA obligation** for 22
publicly displayed driver headshots, 20 of which oblige attribution — and because the committed
PNGs are downscaled (longest edge 400px) and transcoded from the Commons originals, BY-SA's
share-alike attaches as well. Attribution has to be given "in any reasonable manner based on the
medium". A raw `.md` blob is a weak reading of that; a real page is not.

A second, smaller thing is true at the same time: `/credits` already exists and is the nav item
everything points at, but it credits only the 3D model. The two obligations are the same kind of
obligation and belong on the same page.

## Goal

One attribution page, styled like the rest of the site, that lists every third-party asset the
project ships with its author, licence and source — generated from the markdown files that are
already the canonical record, so the page cannot silently drift from them.

## Verified starting state

Do not rebuild any of this. It is on the branch today.

| Fact | Where |
|---|---|
| `/credits` page: 3D model, Technologies, Data Sources, License, back link | [`app/credits/page.tsx`](../../../frontend/app/credits/page.tsx), 125 lines, fully static |
| Nav and two in-page links already point at `/credits` | [`components/landing/links.ts:6`](../../../frontend/components/landing/links.ts), [`app/showcase/page.tsx:29`](../../../frontend/app/showcase/page.tsx), [`components/3d/f1-car-showcase.tsx:106`](../../../frontend/components/3d/f1-car-showcase.tsx) |
| 22 headshots + credit table, 22 rows | `public/drivers/` |
| 10 logo SVGs + credit table, 10 rows | `public/logos/` |
| Six credit invariants, all still wanted | [`tests/driver-credits.test.tsx`](../../../frontend/tests/driver-credits.test.tsx) |
| Contrast helpers: `contrastRatio`, `DARK_BG`, `MIN_CONTRAST` | [`lib/team-utils.ts`](../../../frontend/lib/team-utils.ts) |
| A way to ask a rendered tree for its resting neutral text colours | [`tests/zinc.ts`](../../../frontend/tests/zinc.ts) — `restingTextNeutrals` |

## Decisions

Each row was settled explicitly during brainstorming. The layout mockups behind row 3 live in
`.superpowers/brainstorm/` (gitignored); the chosen one is option **B**.

| # | Question | Decision |
|---|---|---|
| 1 | New page or fold into `/credits`? | **Fold into `/credits`.** One attribution page; the nav item already points there |
| 2 | Restyle only the new sections, or the page? | **The whole page**, to the `/teams` visual language |
| 3 | How the asset lists look | **Thumbnail-led table** — each row led by the actual headshot or logo, then subject, author, licence, source |
| 4 | Where the credit data lives | **Parse the markdown at build time.** The `.md` files stay canonical |
| 5 | Fate of the raw `.md` URLs | **Files stay in `public/`**; the user-facing link points at the page instead |

## Architecture

Three units. Each one is independently testable, and that is the whole reason for the split:
**React Testing Library cannot render an async server component**, so if the page did its own
parsing and its own table markup, neither would be reachable from a test. Splitting them leaves
the page too thin to hide a bug.

| Unit | Responsibility | Depends on |
|---|---|---|
| `frontend/lib/credits.ts` | Pure data. Reads a markdown file, finds a table **by its header row**, returns typed rows. Throws on anything malformed. | `node:fs`, `node:path` |
| `frontend/components/credits/attribution-table.tsx` | Pure presentation. Takes rows plus a thumbnail base path, renders the thumbnail-led table. No I/O, no data knowledge. | `next/image` |
| `frontend/app/credits/page.tsx` | Thin composition. Calls the data functions, passes rows down, holds the static prose sections. | both above |

### `lib/credits.ts`

```ts
export interface CreditRow {
  /** Bare filename as the markdown cites it, e.g. `george-russell.png`. */
  file: string;
  /** Driver or team name — the "Driver" / "Team" column. */
  subject: string;
  /** Link text of the Commons source cell: the Commons file title. */
  sourceTitle: string;
  /** Link target of the Commons source cell. */
  sourceUrl: string;
  /** "Author" for drivers, "Attributed to" for logos. */
  author: string;
  licence: string;
}

export interface MarqueNote {
  file: string;
  whatItIs: string;
  whatItIsMissing: string;
}

export function readDriverCredits(): CreditRow[];
export function readLogoCredits(): CreditRow[];
export function readMarqueNotes(): MarqueNote[];
export function readLicenceTerms(): Map<string, string>;   // licence name → terms URL
```

**Matching is on the header row, not on the cells.** This is the one trap in the whole task.
`logos/CREDITS.md` contains a second table —

```
| File | What it is | What it is missing |
```

— whose four rows also lead with a backticked filename, so a naive `` `*.svg` `` scan over the
file finds **14 rows for 10 files**. `drivers/CREDITS.md` has the same shape of problem with its
`| Licence | Terms |` table. So the parser is given the header cells it wants, finds the line whose
trimmed pipe-split cells equal them, skips the `|---|` separator, and consumes rows until the first
line that is not a table row.

| Function | Header row it matches | Rows today |
|---|---|---|
| `readDriverCredits` | `File \| Driver \| Commons source \| Author \| Licence` | 22 |
| `readLogoCredits` | `File \| Team \| Commons source \| Attributed to \| Licence` | 10 |
| `readMarqueNotes` | `File \| What it is \| What it is missing` | 4 |
| `readLicenceTerms` | `Licence \| Terms` | 6 |

Paths resolve as `join(process.cwd(), 'public', 'drivers' | 'logos', 'CREDITS.md')`, matching what
`tests/driver-credits.test.tsx` already does. `import.meta.url` is deliberately **not** used: under
the jsdom environment it is not a `file:` URL and `fileURLToPath` throws at import time — the
existing test file carries that comment for the same reason.

### Error handling: a malformed row throws at build

Attribution that silently renders an empty author is the single failure mode that matters on this
page, so every one of these is a thrown `Error`, not a skipped row and not a placeholder:

| Condition | Why it must throw |
|---|---|
| Header row not found | The file was restructured; rendering zero rows would silently drop 22 credits |
| A row's cell count ≠ the header's | Column shifted; author and licence would be read from the wrong cells |
| `file` cell is not `` `name.ext` `` | Same |
| Empty `author`, `licence` or `subject` | An unattributed credit is worse than a missing page |
| Source cell is not a markdown `[title](url)` link | The obligation includes a route back to the original |

The route is statically rendered, so "at build" means `pnpm build` fails — loud, in CI, before
deploy. No `try`/`catch` anywhere in this path. (The backend's "tools never raise" convention is
about a degrading LLM pipeline and does not apply to a build-time data read.)

### `components/credits/attribution-table.tsx`

```tsx
export function AttributionTable(props: {
  rows: CreditRow[];
  /** `/drivers` or `/logos` — prefixed to `row.file` for the thumbnail src. */
  basePath: string;
  /** Photographs are cropped square; logos are contained on a tile. */
  variant: 'photo' | 'logo';
  /** Column heading over the subject column: "Driver" or "Team". */
  subjectLabel: string;
  /** Column heading over the author column: "Author" or "Attributed to". */
  authorLabel: string;
  /** Visually hidden <caption>, so the table is announced. */
  caption: string;
  /** Licence name → terms URL. Passed for the driver table; omitted for the logo table, whose ten rows are all `Public domain` with no terms row to link to. */
  licenceTerms?: Map<string, string>;
}): JSX.Element;
```

A real `<table>`: `<caption class="sr-only">`, `<th scope="col">` headers, one `<tr>` per asset. Not
a div grid — this is tabular data and screen-reader column association is the point.

Five columns at every width, `w-full table-fixed`. The thumbnail column's width depends on
`variant`; the rest split what is left:

| Column | Content |
|---|---|
| — | The asset itself, `next/image`, `alt=""` — the adjacent subject cell is the row's accessible name and a duplicate would be read twice |
| Subject | Driver or team name, `text-zinc-300` |
| Author | Author string verbatim, including the `Original: …; Derivative work: …` form Lando Norris' row uses |
| Licence | Licence name; linked to its terms URL when `licenceTerms` has one, plain text otherwise (every `Public domain` logo row is the plain case) |
| Source | Visible text `Commons`, `href` = `sourceUrl`, `target="_blank" rel="noopener noreferrer"`, `aria-label={sourceTitle}` so the accessible name is the full Commons file title, and an `aria-hidden` `↗`. The titles run past 90 characters and cannot be column text at 390px |

**The two variants size their thumbnail differently, and this is not a style choice.**

| `variant` | Column | Image |
|---|---|---|
| `photo` | `44px` | 32px square, `object-cover`, rounded — the headshots are already square crops |
| `logo` | `88px` | height `20px`, `width: auto`, `maxWidth: 72px`, `object-contain`, on a `bg-zinc-900` tile |

The committed logos are horizontal lockups running from 0.91:1 to **9.48:1** (the Aston Martin
wordmark). Squeezing that into a 32px square with `object-contain` draws it ~3.4px tall — less
legible than no thumbnail at all. Height-driven sizing with a wide max-width is the same rule
[`team-logo.tsx`](../../../frontend/components/teams/team-logo.tsx) already documents at length;
this table obeys it rather than rediscovering it. `next/image` on a local SVG needs no
`next.config.js` change — `TeamLogo` does exactly that on `/teams` today.

Below `sm` the author, licence and source cells drop to `text-[10px]`. **No horizontal scroll
container and no reflow-to-cards** — 390x844 is one of the three verification viewports, and the
gate is a real browser, not a guess about it.

### `app/credits/page.tsx`

Stays a server component, gains no `'use client'`, fetches nothing at runtime. It calls the four
read functions at module render, passes rows into two `AttributionTable`s, and holds the prose.

## Page order

intro → **Driver photographs** → **Team logos** → 3D model → Technologies → Data sources →
Licence → back link.

| Section | `id` | Content |
|---|---|---|
| Driver photographs | `driver-photographs` | The obligation paragraph, then the 22-row table |
| Team logos | `team-logos` | Public-domain-but-trademarked note, the 10-row table, then the 4-row marque-marks table |
| 3D model | — | Unchanged content, restyled: Nimaxo, CC BY 4.0, Sketchfab |
| Technologies | — | Unchanged content, restyled |
| Data sources | — | **Adds OpenF1** beside FastF1, Tavily, OpenWeather |
| Licence | — | MIT, plus the note that the 3D model, headshots and logos carry their own terms |

`driver-photographs` is the fragment the `/teams` footer link targets, so it must be on the
section element and must not move.

The 4-row marque-marks table does **not** go through `AttributionTable` — it has no author,
licence, source or thumbnail, only *what the mark is* and *what it is missing*. It renders inline
in `page.tsx` as a plain three-column table over `readMarqueNotes()`. That keeps the unit count at
three: the interesting part of it is the parse, which `tests/credits-data.test.ts` covers, and the
markup has nothing in it to get wrong.

The two prose notes in `logos/CREDITS.md` — Racing Bulls has no freely licensed vector, and
`alpine.svg`'s single `fill` attribute was changed for a dark background — get **one hand-written
summary line each**, plus a link to the raw file for the full argument. Do not build a markdown
prose renderer for two paragraphs.

`public/drivers/CREDITS.md` and `public/logos/CREDITS.md` stay exactly where they are and stay
canonical. The page links to both.

## Restyle rules

The `/teams` visual language, which the rest of the branch just spent five commits establishing:

| Element | Value |
|---|---|
| Ground | `bg-zinc-950` |
| Body copy | `text-zinc-400` |
| Emphasis / table cells | `text-zinc-300` |
| Links | `text-zinc-300 underline decoration-zinc-700 underline-offset-2`, hover `text-white decoration-zinc-400`, `focus-visible:ring-2 focus-visible:ring-zinc-500` |
| Section labels | `text-[10px] uppercase tracking-[0.2em]` |
| Hairlines | `border-zinc-800` |
| `f1-red` | **Large headings and rules only** |

Two measured constraints behind that last row:

- `f1-red` (`#dc2626`) on `zinc-950` is **4.12:1** — it fails WCAG AA for normal text and passes
  only the 3:1 large-text bar. The existing `text-2xl` / `text-4xl` headings are fine and stay.
  **Never put small text in `f1-red`.**
- The existing `blue-400` links measure **6.97:1** on `zinc-900` and already pass. Moving them to
  the zinc scale is a **consistency** change, not a contrast fix — say so, and don't claim a fix
  that wasn't needed.

Two things on the page are already accurate and must not be "corrected": "Next.js 14" (14.2.18 is
installed) and "Gemini 3.6 Flash". The one real factual gap is the missing OpenF1 entry.

## Testing

Both new test files are flat in `frontend/tests/`, kebab-case, like every other one. Nothing here
adds a top-level directory, so `next.config.js`'s `eslint.dirs` needs no new entry — `app`,
`components`, `lib` and `tests` are all already listed.

### Existing suites

`tests/driver-credits.test.tsx` keeps all six invariants. Exactly one line changes: the footer
assertion at line 91 becomes `/credits#driver-photographs`, matching
`teams-comparison-grid.tsx:186`. Its "links the credits from the page, visibly and by keyboard"
test is the one that proves the obligation is reachable, and it must keep passing — a link into
a page fragment discharges it at least as well as a link to a file.

### New: `tests/credits-data.test.ts`

Against the real in-repo markdown — the files are committed, so no fixtures are needed for the
happy path:

- `readLogoCredits()` returns **10** rows, not 14. This is the regression guard for the
  second-table trap and is the single most important test in the task.
- `readDriverCredits()` returns one row per committed PNG, and `readLogoCredits()` one per
  committed SVG, compared against `readdirSync` — same directory scan the existing suite uses.
- Every row has a non-empty author, licence and subject, and a `commons.wikimedia.org` source URL.
- `readMarqueNotes()` returns 4 rows; `readLicenceTerms()` maps `CC BY-SA 4.0` to its URL.
- Malformed input throws. Inline markdown strings, one per condition in the error-handling table
  above — a short row, a missing header, an empty author, a bare-text source cell. These are the
  only synthetic fixtures in the task, and they are string literals in the test, not files.

### New: `tests/attribution-table.test.tsx`

Renders the component with the **real** parsed rows (`node:fs` works under Vitest):

- Every committed PNG appears in the rendered table with `src` containing `/drivers/<file>`, and
  every SVG with `/logos/<file>`. This is the "no asset renders uncredited" invariant, now
  asserted against the DOM rather than against the markdown.
- Each row exposes its author and licence as text, and a source anchor with an `https://` href
  and an accessible name carrying the Commons title.
- Contrast: `restingTextNeutrals` from `tests/zinc.ts` over the rendered tree, every hex checked
  with `contrastRatio(hex, DARK_BG) >= MIN_CONTRAST` from `lib/team-utils.ts`. Extend `tests/zinc.ts`
  only if a shade outside its current map is used — its `throw` already forces that.
- No element carrying text has the `text-f1-red` class unless it also carries a heading size
  class. That is the small-text-in-red rule made mechanical.
- Table semantics: a `<caption>`, and `<th scope="col">` on every header cell.

The page itself gets **no** unit test. It is an async server component; RTL cannot render it, and
pretending otherwise with a mock proves nothing. Its correctness is covered by the three units
below it plus the browser pass.

### Browser verification — the actual gate

A green `pnpm test` is not evidence for anything visual. This branch shipped a scroll spy that
never tracked scroll past 290 tests and four review passes, and three separate contrast tests
measured the right colour against the wrong background and passed while the page failed.

With the dev server on :3000 (`curl` it before starting another; **never `pnpm build` while it
runs** — shared `.next`), at **1440x900, 1152x800 and 390x844**:

1. `set viewport` **before** `open`/`reload`, and assert `[innerWidth, innerHeight]` inside the
   probe. A sweep that reports identical numbers at every width never changed viewport.
2. `agent-browser a11y` (axe) → **zero** violations, and read the *incomplete* list too. axe
   reports "background could not be determined" as incomplete, never as a violation; that is not
   a pass.
3. No horizontal overflow: `document.documentElement.scrollWidth <= window.innerWidth`. This is
   the assertion the five-column table at 390px exists to satisfy.
4. Thumbnails actually paint *and* are legible — every `img` has `naturalWidth > 0` (22 and 10),
   and every logo thumbnail's laid-out height is ≥ 16px. jsdom lays nothing out, so the
   aspect-ratio rule above is only ever really checked here.
5. `/teams` → footer link → lands on `/credits` with the driver table in view.
6. Full-viewport or `--full` screenshots only. Element screenshots come back all black in this
   environment, and screenshot paths must be absolute — `agent-browser`'s daemon cwd is not the
   worktree, and a stray `shot-test.png` landed in the repo root that way this session.

## CLAUDE.md

Notes land with the code that makes them true:

| Note | Lands with |
|---|---|
| Credit tables are matched by **header row**; a naive filename scan finds 14 rows for 10 files | `lib/credits.ts` |
| A malformed credit row throws at build, on purpose — the "tools never raise" convention is backend-only | `lib/credits.ts` |
| RTL cannot render an async server component; that is why data, table and page are three units | `attribution-table.tsx` |

## Out of scope

- **A markdown prose renderer.** Two paragraphs get two hand-written lines.
- **Moving, deleting or rewriting the `.md` files.** They stay canonical and stay in `public/`.
- **Re-querying the Commons API.** Authors and licences are taken as the files record them; the
  files already document how to re-derive one.
- **Any backend change**, and any runtime data fetching on `/credits`.
- **Other routes.** `/teams` changes by exactly one `href`.
- `components/ui/` — generated shadcn / Magic UI files are never hand-edited.
- The team-name-versus-artwork mismatches (`haas.svg` reads *TGR Haas*, `audi.svg` *Audi Revolut*,
  `williams.svg` *Atlassian Williams*). `logos/CREDITS.md` already logs them as a `teams-data.ts`
  reconciliation, and this page renders the artwork's own wording faithfully.

## One addition beyond the five approved decisions

Linking each licence name to its terms URL, via a fourth parsed table (`readLicenceTerms`). It
reuses the same header-row matcher, costs one column change, and turns "CC BY-SA 4.0" from a
string into the licence a reader can actually go and read. **Say if you want it cut** — the rest of
the spec stands without it.
