# /teams Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/teams` right-rail 3D car with real team logos and driver headshots, and raise all four surfaces of the page to a broadcast-graphics-plus-cinematic-depth visual language.

**Architecture:** The page keeps its current data flow — `TeamsPageClient` owns `activeTeamId`, each `TeamSection` reports itself via `IntersectionObserver`, the sticky rail re-renders for the active team. Only what the surfaces render changes. Two new leaf components, `team-logo.tsx` and `driver-portrait.tsx`, absorb all image handling and fallback logic so no page section branches on asset availability.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, `motion/react` (the `motion` package), `next/image`, Vitest + Testing Library + jsdom, pnpm via mise.

**Spec:** `docs/superpowers/specs/2026-08-03-teams-page-visual-overhaul-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

**Repo conventions (from CLAUDE.md):**
- File names are **kebab-case, no exceptions**. Component names stay PascalCase.
- **Named exports.** No default exports outside `app/`.
- `Team` and `Driver` import from `@/data/teams-data`, **not** `@/types`.
- Tests are **flat** in `frontend/tests/`, not mirroring the source tree.
- Logging/config conventions are backend-only; this plan touches no backend file.
- `components/ui/` is generated — **never hand-edit**.
- Commands run via mise: `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`, all from `frontend/`.
- Plain `node`/`npx` are **not on PATH**. Prefix with `mise exec --`, or export `/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin` onto PATH for raw node scripts.

**Motion rules (from `iart-ai/60fps-animation` and `jakubkrehel/better-ui`):**
- Animate **only `transform` and `opacity`**. Never animate `width`, `height`, `top`, `left`, `flex`, `margin`, or `box-shadow` per frame.
- Bar fills use `transform: scaleX()` with `transform-origin: left`, never `width`.
- Row reordering uses motion's `layout` prop (which performs FLIP internally).
- **Never `transition: all`** — always name exact properties.
- Springs use `{ type: 'spring', duration: 0.3, bounce: 0 }`. **`bounce` is always `0`.**
- Stagger entrances by **~100ms** per semantic chunk.
- Press feedback is **`scale(0.96)`** exactly. Never below `0.95`.
- Images get a `1px` outline at `oklch(1 0 0 / 0.1)` — pure white for this dark UI, never a tinted zinc.
- Concentric radius: outer radius = inner radius + padding.

**Accessibility:**
- `reducedMotion` is already threaded from `TeamsPageClient` into every section. Every new animation branches on it, collapsing to its final state.
- Interactive elements are `<button>`, never a div with `onClick`.
- Keep the existing `focus-visible:ring-2 focus-visible:ring-zinc-500` pattern from `teams-nav-rail.tsx`.

**Degradation:** The page must look finished with **zero** image assets present. `logo` and `headshot` are always populated paths; the fallback is driven purely by `next/image`'s `onError`.

**Do not touch:** `next.config.js` (local `public/` paths need no `remotePatterns`), `components/3d/`, `components/ui/`, anything under `backend/`, or `inspect-modal.tsx` beyond leaving it working.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/data/teams-data.ts` | **Modify** — add `logo`, `headshot`, `points`, `position`; export `STANDINGS_AS_OF` |
| `frontend/lib/team-utils.ts` | **Modify** — add `seasonsSince`, `duotoneFor` |
| `frontend/components/teams/team-logo.tsx` | **Create** — logo image with monogram fallback |
| `frontend/components/teams/driver-portrait.tsx` | **Create** — duotone headshot with ghost-number fallback |
| `frontend/scripts/fetch-team-assets.mjs` | **Create** — one-shot asset downloader |
| `frontend/components/teams/sticky-team-panel.tsx` | **Create** (replaces `sticky-car-viewer.tsx`) — dossier stack rail |
| `frontend/components/teams/team-section.tsx` | **Modify** — full-bleed portraits + watermark |
| `frontend/components/teams/teams-hero.tsx` | **Modify** — livery wall |
| `frontend/components/teams/teams-nav-rail.tsx` | **Modify** — logo chip + position/points |
| `frontend/components/teams/teams-comparison-grid.tsx` | **Modify** — bar race with sort tabs |
| `frontend/components/teams/teams-page-client.tsx` | **Modify** — import the renamed rail |
| `frontend/tests/*.test.tsx` | **Create** — six new test files, flat |

Tasks 1–3 are the foundation every later task consumes. Tasks 5–9 are the four surfaces and are mutually independent — they can be reviewed and rejected separately.

---

### Task 1: Data layer and helpers

**Files:**
- Modify: `frontend/data/teams-data.ts`
- Modify: `frontend/lib/team-utils.ts`
- Test: `frontend/tests/team-utils.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `Driver.headshot: string`, `Team.logo: string`, `Team.points: number`, `Team.position: number`
  - `STANDINGS_AS_OF: string` from `@/data/teams-data`
  - `seasonsSince(firstEntry: number): number` from `@/lib/team-utils`
  - `duotoneFor(team: Team): { color: string; opacity: number; keyline: string }` from `@/lib/team-utils`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/team-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { seasonsSince, duotoneFor, teamColorButtonStyle } from '@/lib/team-utils';
import { TEAMS, TEAM_MAP, STANDINGS_AS_OF } from '@/data/teams-data';

describe('seasonsSince', () => {
  it('counts seasons from the debut year to 2026', () => {
    expect(seasonsSince(1950)).toBe(76);
    expect(seasonsSince(1966)).toBe(60);
  });

  it('returns 0 for a team debuting in 2026', () => {
    expect(seasonsSince(2026)).toBe(0);
  });
});

describe('duotoneFor', () => {
  it('washes a portrait in the team colour', () => {
    const ferrari = TEAM_MAP['ferrari']!;
    expect(duotoneFor(ferrari).color).toBe('#dc0000');
    expect(duotoneFor(ferrari).opacity).toBeGreaterThan(0);
  });

  it('substitutes a neutral tint for white-liveried teams', () => {
    const haas = TEAM_MAP['haas']!;
    expect(haas.color).toBe('#ffffff');
    // A white wash over zinc-950 erases the portrait, so Haas gets a neutral
    // tint plus a visible keyline instead.
    expect(duotoneFor(haas).color).not.toBe('#ffffff');
    expect(duotoneFor(haas).keyline).toBe('#ffffff');
  });
});

describe('teamColorButtonStyle', () => {
  it('still special-cases the white livery', () => {
    expect(teamColorButtonStyle(TEAM_MAP['haas']!).className).toBe('border');
  });
});

describe('standings data', () => {
  it('gives every team a position, points, logo and driver headshots', () => {
    for (const team of TEAMS) {
      expect(team.logo).toBe(`/logos/${team.id}.svg`);
      expect(team.position).toBeGreaterThanOrEqual(1);
      expect(team.points).toBeGreaterThanOrEqual(0);
      for (const driver of team.drivers) {
        expect(driver.headshot).toBe(`/drivers/${driver.id}.png`);
      }
    }
  });

  it('assigns each championship position exactly once', () => {
    const positions = TEAMS.map((t) => t.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('ranks Mercedes first on 379 points and Cadillac last on zero', () => {
    expect(TEAM_MAP['mercedes']!.points).toBe(379);
    expect(TEAM_MAP['mercedes']!.position).toBe(1);
    expect(TEAM_MAP['cadillac']!.points).toBe(0);
    expect(TEAM_MAP['cadillac']!.position).toBe(11);
  });

  it('dates its own numbers rather than implying they are live', () => {
    expect(STANDINGS_AS_OF).toMatch(/Round 11/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-utils.test.ts`
Expected: FAIL — `seasonsSince is not a function`, `STANDINGS_AS_OF` undefined.

- [ ] **Step 3: Extend the data types and add the standings**

In `frontend/data/teams-data.ts`, add to the interfaces:

```ts
export interface Driver {
  id: string;
  name: string;
  number: number;
  nationality: string;
  shortCode: string;
  /** Public path to the headshot. Always set; missing files fall back at render. */
  headshot: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  textOnColor: 'white' | 'black';
  drivers: [Driver, Driver];
  base: string;
  powerUnit: string;
  firstEntry: number;
  championships: number;
  tagline: string;
  /** Public path to the logo. Always set; missing files fall back at render. */
  logo: string;
  /** 2026 constructors' championship points, frozen at STANDINGS_AS_OF. */
  points: number;
  /** 2026 constructors' championship position, frozen at STANDINGS_AS_OF. */
  position: number;
}

/**
 * The page is static, so it states the date of its own numbers rather than
 * implying they are live. Refreshing the standings is a data edit, not a
 * code change.
 */
export const STANDINGS_AS_OF = 'After Round 11 · Hungary';
```

Then add `logo: '/logos/<team.id>.svg'`, `points`, and `position` to each of the eleven team
objects, and `headshot: '/drivers/<driver.id>.png'` to each of the twenty-two driver objects.
Use these values, verified 2026-08-03 against formula1.com and RacingNews365, which agreed
exactly:

| `id` | `position` | `points` |
|---|---|---|
| `mercedes` | 1 | 379 |
| `ferrari` | 2 | 307 |
| `mclaren` | 3 | 220 |
| `red-bull` | 4 | 177 |
| `racing-bulls` | 5 | 66 |
| `alpine` | 6 | 61 |
| `haas` | 7 | 21 |
| `audi` | 8 | 12 |
| `williams` | 9 | 11 |
| `aston-martin` | 10 | 1 |
| `cadillac` | 11 | 0 |

Driver ids for the headshot paths are already in the file: `george-russell`, `kimi-antonelli`,
`charles-leclerc`, `lewis-hamilton`, `lando-norris`, `oscar-piastri`, `max-verstappen`,
`isack-hadjar`, `esteban-ocon`, `oliver-bearman`, `liam-lawson`, `arvid-lindblad`,
`nico-hulkenberg`, `gabriel-bortoleto`, `pierre-gasly`, `franco-colapinto`, `carlos-sainz`,
`alexander-albon`, `sergio-perez`, `valtteri-bottas`, `fernando-alonso`, `lance-stroll`.

**Do not reorder the `TEAMS` array.** It drives the on-page section order, which is
deliberately not championship order.

- [ ] **Step 4: Add the helpers**

Append to `frontend/lib/team-utils.ts`:

```ts
/** The season the page describes. Used to derive elapsed seasons from a debut year. */
const CURRENT_SEASON = 2026;

/** Seasons elapsed since a constructor's debut, for the rail's derived stat cell. */
export function seasonsSince(firstEntry: number): number {
  return CURRENT_SEASON - firstEntry;
}

/**
 * Wash colour for a driver portrait. Mirrors the `#ffffff` special-case that
 * `teamColorButtonStyle` already establishes: a white wash over zinc-950 erases the
 * portrait entirely, so Haas gets a neutral tint and leans on a white keyline instead.
 */
export function duotoneFor(team: Team): { color: string; opacity: number; keyline: string } {
  const isWhite = team.color === '#ffffff';
  return {
    color: isWhite ? '#52525b' : team.color,
    opacity: isWhite ? 0.35 : 0.45,
    keyline: isWhite ? '#ffffff' : team.color,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-utils.test.ts && mise exec -- pnpm typecheck`
Expected: PASS, and tsc reports nothing.

The typecheck is the real gate here — adding required fields to `Team` and `Driver` breaks
every construction site that misses one.

- [ ] **Step 6: Commit**

```bash
git add frontend/data/teams-data.ts frontend/lib/team-utils.ts frontend/tests/team-utils.test.ts
git commit -m "Give every team its 2026 standing, logo path and headshot paths"
```

---

### Task 2: `team-logo.tsx`

**Files:**
- Create: `frontend/components/teams/team-logo.tsx`
- Test: `frontend/tests/team-logo.test.tsx`

**Interfaces:**
- Consumes: `Team` (with `logo`) from Task 1.
- Produces: `<TeamLogo team={team} size={number} className?={string} />` from `@/components/teams/team-logo`. Renders an `<img>` (via `next/image`) on success and a monogram `<div>` on error. The monogram is the team's `shortName` uppercased, first three alphabetic characters.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/team-logo.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamLogo } from '@/components/teams/team-logo';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const haas = TEAM_MAP['haas']!;

describe('TeamLogo', () => {
  it('renders the logo image from the team path', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    const img = screen.getByAltText('Ferrari logo');
    expect(img).toBeInTheDocument();
  });

  it('falls back to a monogram when the image fails to load', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.queryByAltText('Ferrari logo')).not.toBeInTheDocument();
    expect(screen.getByText('FER')).toBeInTheDocument();
  });

  it('gives the monogram the team colour', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ backgroundColor: '#dc0000' });
  });

  it('skips spaces when building a monogram from a multi-word name', () => {
    const astonMartin = TEAM_MAP['aston-martin']!;
    render(<TeamLogo team={astonMartin} size={48} />);
    fireEvent.error(screen.getByAltText('Aston Martin logo'));
    expect(screen.getByText('AST')).toBeInTheDocument();
  });

  it('keeps the white livery legible by darkening the monogram text', () => {
    render(<TeamLogo team={haas} size={48} />);
    fireEvent.error(screen.getByAltText('Haas logo'));
    expect(screen.getByText('HAA')).toHaveStyle({ color: '#000000' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-logo.test.tsx`
Expected: FAIL — cannot resolve `@/components/teams/team-logo`.

- [ ] **Step 3: Write the component**

Create `frontend/components/teams/team-logo.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type Team } from '@/data/teams-data';

interface TeamLogoProps {
  team: Team;
  /** Rendered edge length in px. Logos are square-boxed. */
  size: number;
  className?: string;
}

/** First three letters of the short name, spaces and punctuation dropped. */
function monogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * A team's logo, falling back to a colour-filled monogram tile.
 *
 * `logo` is always a populated path, so the fallback is driven purely by the image
 * failing to load — an asset that has not been fetched yet behaves exactly like a 404.
 */
export function TeamLogo({ team, size, className }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded font-black leading-none',
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: team.color,
          color: team.textOnColor === 'black' ? '#000000' : '#ffffff',
          fontSize: size * 0.3,
        }}
      >
        {monogram(team.shortName)}
      </div>
    );
  }

  return (
    <Image
      src={team.logo}
      alt={`${team.shortName} logo`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn('flex-shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-logo.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/team-logo.tsx frontend/tests/team-logo.test.tsx
git commit -m "Render a team logo that degrades to a monogram, not a broken image"
```

---

### Task 3: `driver-portrait.tsx`

**Files:**
- Create: `frontend/components/teams/driver-portrait.tsx`
- Test: `frontend/tests/driver-portrait.test.tsx`

**Interfaces:**
- Consumes: `Driver`, `Team` from Task 1; `duotoneFor` from Task 1.
- Produces: `<DriverPortrait driver={driver} team={team} priority?={boolean} className?={string} />` from `@/components/teams/driver-portrait`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/driver-portrait.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DriverPortrait } from '@/components/teams/driver-portrait';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const leclerc = ferrari.drivers[0];

describe('DriverPortrait', () => {
  it('renders the headshot with the driver name as alt text', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByAltText('Charles Leclerc')).toBeInTheDocument();
  });

  it('always shows name, number and nationality regardless of image state', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Monégasque')).toBeInTheDocument();
  });

  it('drops the image and keeps the plate when the headshot fails to load', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('marks the first team’s portraits as priority to avoid a blank rail on arrival', () => {
    const { container } = render(
      <DriverPortrait driver={leclerc} team={ferrari} priority />,
    );
    expect(container.querySelector('img')).toHaveAttribute('fetchpriority', 'high');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/driver-portrait.test.tsx`
Expected: FAIL — cannot resolve `@/components/teams/driver-portrait`.

- [ ] **Step 3: Write the component**

Create `frontend/components/teams/driver-portrait.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { duotoneFor } from '@/lib/team-utils';
import { type Driver, type Team } from '@/data/teams-data';

interface DriverPortraitProps {
  driver: Driver;
  team: Team;
  /** Eager-load. Set for the first team so the rail is never blank on arrival. */
  priority?: boolean;
  className?: string;
}

/**
 * A driver headshot washed in the team colour and dissolved into the page.
 *
 * The name plate and ghost number render either way, so a missing headshot degrades
 * to the text-only card the page shipped before rather than to a hole.
 */
export function DriverPortrait({ driver, team, priority, className }: DriverPortraitProps) {
  const [failed, setFailed] = useState(false);
  const duotone = duotoneFor(team);

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-gradient-to-b from-zinc-800/70 to-zinc-950',
        className,
      )}
      // A pure-white hairline reads as an edge; a tinted one reads as dirt.
      style={{ outline: '1px solid oklch(1 0 0 / 0.1)', outlineOffset: '-1px' }}
    >
      {!failed && (
        <>
          <Image
            src={driver.headshot}
            alt={driver.name}
            fill
            sizes="(max-width: 1024px) 50vw, 180px"
            priority={priority}
            onError={() => setFailed(true)}
            className="object-cover object-top"
          />
          {/* Team-colour wash. Sits above the image, below the plate. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 mix-blend-color"
            style={{ backgroundColor: duotone.color, opacity: duotone.opacity }}
          />
        </>
      )}

      {/* Dissolve into the page so the portrait has no hard bottom edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"
      />

      {/* Ghost number — the fallback card's signature element, kept in both states. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1 select-none font-black leading-none text-white"
        style={{ opacity: failed ? 0.06 : 0.45, fontSize: failed ? '5rem' : '2.5rem' }}
      >
        {driver.number}
      </span>

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: duotone.keyline }}
        >
          {driver.nationality}
        </p>
        <p className="mt-0.5 text-sm font-bold leading-tight text-white">{driver.name}</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">
          {driver.shortCode}
        </p>
      </div>

      {/* Screen-reader-visible number; the ghost numeral above is decorative. */}
      <span className="sr-only">Car number {driver.number}</span>
    </div>
  );
}
```

Note the number appears twice: once as the decorative ghost numeral (`aria-hidden`) and once
in `sr-only` text. The test asserting `getByText('16')` matches the visible numeral.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && mise exec -- pnpm vitest run tests/driver-portrait.test.tsx`
Expected: PASS, 4 tests.

If the `priority` assertion fails because the installed `next/image` emits a different
attribute, read the rendered `<img>` in the failure output and assert whatever `next/image`
actually sets for priority in this version. Do not delete the test.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/driver-portrait.tsx frontend/tests/driver-portrait.test.tsx
git commit -m "Wash driver headshots in team colour, degrading to the old text card"
```

---

### Task 4: Asset fetch script

**Files:**
- Create: `frontend/scripts/fetch-team-assets.mjs`
- Create (generated, committed): `frontend/public/logos/*.svg`, `frontend/public/drivers/*.png`

**Interfaces:**
- Consumes: the `id` values from Task 1.
- Produces: files on disk only. No module exports.

This task has no unit test — it is a one-shot developer script whose output is the committed
files. Its correctness is verified by the files existing and the page rendering them.

- [ ] **Step 1: Write the script**

Create `frontend/scripts/fetch-team-assets.mjs`:

```js
#!/usr/bin/env node
/**
 * One-shot downloader for team logos and driver headshots.
 *
 * Not part of the build — the committed files under public/ are the source of truth.
 * Re-run only to refresh or add an asset. Sources are public/Wikimedia URLs; any entry
 * that cannot be sourced is simply left out and the UI falls back at render.
 *
 * Usage: mise exec -- node scripts/fetch-team-assets.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOGOS = {
  // 'team-id': 'https://…svg'
};

const HEADSHOTS = {
  // 'driver-id': 'https://…png'
};

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'f1-briefing-agent/1.0 (personal project)' },
  });
  if (!response.ok) {
    console.warn(`  skip ${destination} — HTTP ${response.status}`);
    return false;
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`  wrote ${destination}`);
  return true;
}

async function main() {
  const logoDir = join('public', 'logos');
  const driverDir = join('public', 'drivers');
  await mkdir(logoDir, { recursive: true });
  await mkdir(driverDir, { recursive: true });

  let ok = 0;
  let missed = 0;

  console.log('Logos:');
  for (const [id, url] of Object.entries(LOGOS)) {
    (await download(url, join(logoDir, `${id}.svg`))) ? ok++ : missed++;
  }

  console.log('Headshots:');
  for (const [id, url] of Object.entries(HEADSHOTS)) {
    (await download(url, join(driverDir, `${id}.png`))) ? ok++ : missed++;
  }

  console.log(`\n${ok} fetched, ${missed} unavailable (those fall back at render).`);
}

main();
```

- [ ] **Step 2: Populate the URL maps**

Search for a public source for each of the 11 team logos and 22 driver headshots and fill in
`LOGOS` and `HEADSHOTS`. Keys must exactly match the `id` values listed in Task 1 Step 3 —
a typo produces a file the UI never looks for and a silent permanent fallback.

Prefer Wikimedia Commons SVG for logos and Wikimedia portrait photographs for drivers. Where
no free image exists for a driver, leave that key out entirely rather than substituting a
lookalike.

- [ ] **Step 3: Run it**

Run: `cd frontend && mise exec -- node scripts/fetch-team-assets.mjs`
Expected: a per-file log and a summary line. Some misses are acceptable and expected.

- [ ] **Step 4: Verify the fallback path still holds**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-logo.test.tsx tests/driver-portrait.test.tsx`
Expected: PASS. These tests simulate load failure directly, so they must pass whether or not
any asset was actually fetched.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/fetch-team-assets.mjs frontend/public/logos frontend/public/drivers
git commit -m "Fetch and commit the team logos and driver headshots"
```

---

### Task 5: Sticky rail — dossier stack

**Files:**
- Create: `frontend/components/teams/sticky-team-panel.tsx`
- Delete: `frontend/components/teams/sticky-car-viewer.tsx`
- Modify: `frontend/components/teams/teams-page-client.tsx:13-19` (the dynamic import) and `:88` (the usage)
- Test: `frontend/tests/sticky-team-panel.test.tsx`

**Interfaces:**
- Consumes: `TeamLogo` (Task 2), `DriverPortrait` (Task 3), `seasonsSince` (Task 1).
- Produces: `<StickyTeamPanel activeTeam={team} onInspect={() => void} />` from `@/components/teams/sticky-team-panel`.

The rename is the point: the file no longer views a car, and `sticky-car-viewer` would
misdescribe it for the next reader. Deleting it also removes the last eager `F1HeroScene`
import on this route, which moves the whole `three` bundle behind the Inspect click.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/sticky-team-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;

describe('StickyTeamPanel', () => {
  it('shows the logo, both drivers and the meta grid', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('Lewis Hamilton')).toBeInTheDocument();
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    expect(screen.getByText('Ferrari')).toBeInTheDocument();
  });

  it('carries the debut year and derives seasons from it', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
  });

  it('shows the championship count', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped by testid, not getByText('16'): Ferrari has 16 championships AND
    // Leclerc is car 16, so a bare text query matches twice and throws.
    expect(screen.getByTestId('championship-count')).toHaveTextContent('16');
  });

  it('calls onInspect when the CTA is pressed', () => {
    const onInspect = vi.fn();
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it('renders a team with no championships without claiming a bar', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/sticky-team-panel.test.tsx`
Expected: FAIL — cannot resolve `@/components/teams/sticky-team-panel`.

- [ ] **Step 3: Write the component**

Create `frontend/components/teams/sticky-team-panel.tsx`. Layout, top to bottom: constructor
counter, logo lockup over faint livery stripes, both portraits side by side, championship
number with a bar, 2×2 meta grid, Inspect CTA.

```tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Expand } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { teamColorButtonStyle, seasonsSince } from '@/lib/team-utils';
import { TEAMS, type Team } from '@/data/teams-data';
import { TeamLogo } from './team-logo';
import { DriverPortrait } from './driver-portrait';

interface StickyTeamPanelProps {
  activeTeam: Team;
  onInspect: () => void;
}

/** The most-decorated constructor, so championship bars share one scale. */
const MOST_CHAMPIONSHIPS = Math.max(...TEAMS.map((t) => t.championships));

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xs text-zinc-200">{value}</p>
    </div>
  );
}

export function StickyTeamPanel({ activeTeam, onInspect }: StickyTeamPanelProps) {
  const ctaStyle = teamColorButtonStyle(activeTeam);
  const index = TEAMS.findIndex((t) => t.id === activeTeam.id);
  const isFirstTeam = index === 0;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div
        className="absolute left-0 right-0 top-0 z-10 h-[2px] transition-colors duration-500"
        style={{ backgroundColor: activeTeam.color }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTeam.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          className="flex h-full min-h-0 flex-col"
        >
          <p className="px-4 pt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            {`Constructor ${String(index + 1).padStart(2, '0')} / ${TEAMS.length}`}
          </p>

          {/* Logo lockup over livery stripes */}
          <div className="relative flex h-[140px] flex-shrink-0 items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.18]"
              style={{
                background: `repeating-linear-gradient(115deg, ${activeTeam.color} 0 3px, transparent 3px 14px)`,
              }}
            />
            <TeamLogo team={activeTeam} size={72} className="relative z-10" />
          </div>

          {/* Both drivers */}
          <div className="flex min-h-0 flex-1 gap-1 px-1">
            {activeTeam.drivers.map((driver) => (
              <DriverPortrait
                key={driver.id}
                driver={driver}
                team={activeTeam}
                priority={isFirstTeam}
                className="min-w-0 flex-1"
              />
            ))}
          </div>

          {/* Broadcast stat block */}
          <div className="flex-shrink-0 border-t border-zinc-800/60 px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              Championships
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                data-testid="championship-count"
                className="text-2xl font-black leading-none text-white"
              >
                {activeTeam.championships > 0 ? activeTeam.championships : '—'}
              </span>
              <span className="h-[7px] flex-1 overflow-hidden bg-zinc-800">
                <span
                  className="block h-full origin-left"
                  style={{
                    backgroundColor: activeTeam.color,
                    transform: `scaleX(${activeTeam.championships / MOST_CHAMPIONSHIPS})`,
                  }}
                />
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3">
              <MetaCell label="Base" value={activeTeam.base} />
              <MetaCell label="Power unit" value={activeTeam.powerUnit} />
              <MetaCell label="First entry" value={String(activeTeam.firstEntry)} />
              <MetaCell label="Seasons" value={String(seasonsSince(activeTeam.firstEntry))} />
            </div>
          </div>

          <div className="flex-shrink-0 px-4 pb-4">
            <Button
              onClick={onInspect}
              className={cn(
                'w-full gap-2 text-xs font-medium transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]',
                ctaStyle.className,
              )}
              style={ctaStyle.style}
            >
              <Expand className="h-3.5 w-3.5" />
              Inspect in 3D
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

The championship bar uses `transform: scaleX()` with `origin-left`, not `width` — a width
animation would re-run layout every frame.

- [ ] **Step 4: Wire it into the page and delete the old file**

In `frontend/components/teams/teams-page-client.tsx`, replace the `StickyCarViewer` dynamic
import with:

```tsx
const StickyTeamPanel = dynamic(
  () => import('./sticky-team-panel').then((m) => ({ default: m.StickyTeamPanel })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-zinc-900" />,
  },
);
```

and the usage in the right `<aside>` with:

```tsx
<StickyTeamPanel activeTeam={TEAM_MAP[activeTeamId]!} onInspect={openInspect} />
```

Then: `git rm frontend/components/teams/sticky-car-viewer.tsx`

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS. Typecheck catches any lingering `sticky-car-viewer` import.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/components/teams frontend/tests/sticky-team-panel.test.tsx
git commit -m "Replace the rail's 3D car with a team dossier, moving three.js behind a click"
```

---

### Task 6: Team sections — full-bleed duotone drivers

**Files:**
- Modify: `frontend/components/teams/team-section.tsx` (replace the `DriverCard` function at `:24-62`, and the right column at `:214-236`)
- Test: `frontend/tests/team-section.test.tsx`

**Interfaces:**
- Consumes: `DriverPortrait` (Task 3), `TeamLogo` (Task 2).
- Produces: no new exports. `TeamSection`'s props are unchanged.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/team-section.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamSection } from '@/components/teams/team-section';
import { TEAM_MAP } from '@/data/teams-data';

const mclaren = TEAM_MAP['mclaren']!;

function renderSection(overrides: Partial<Parameters<typeof TeamSection>[0]> = {}) {
  return render(
    <TeamSection
      team={mclaren}
      index={2}
      isActive
      onActivate={vi.fn()}
      onInspect={vi.fn()}
      reducedMotion={false}
      {...overrides}
    />,
  );
}

describe('TeamSection', () => {
  it('renders both drivers as portraits', () => {
    renderSection();
    expect(screen.getByAltText('Lando Norris')).toBeInTheDocument();
    expect(screen.getByAltText('Oscar Piastri')).toBeInTheDocument();
  });

  it('keeps the constructor name and meta stats', () => {
    renderSection();
    expect(screen.getByText('Woking, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('1966')).toBeInTheDocument();
  });

  it('renders a decorative watermark that screen readers ignore', () => {
    const { container } = renderSection();
    const watermark = container.querySelector('[data-testid="team-watermark"]');
    expect(watermark).toHaveAttribute('aria-hidden', 'true');
  });

  it('reports itself active once the stubbed observer fires', () => {
    const onActivate = vi.fn();
    renderSection({ onActivate });
    // tests/setup.ts's IntersectionObserver stub reports everything as immediately
    // in view, so observe() invokes the callback synchronously on mount.
    expect(onActivate).toHaveBeenCalledWith('mclaren');
  });

  it('exposes a scroll target id for the nav rail and hero to jump to', () => {
    renderSection();
    expect(document.getElementById('team-mclaren')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/team-section.test.tsx`
Expected: FAIL — `getByAltText('Lando Norris')` finds nothing, because the current
`DriverCard` renders text only.

- [ ] **Step 3: Replace `DriverCard` with portraits**

In `frontend/components/teams/team-section.tsx`:

Delete the entire `DriverCardProps` interface and `DriverCard` function (lines 17–62), and
drop the now-unused `Card` and `Badge` imports.

Add these imports:

```tsx
import { DriverPortrait } from './driver-portrait';
import { TeamLogo } from './team-logo';
```

Replace the right-hand driver column with:

```tsx
{/* Right: driver portraits */}
<div className="flex flex-col gap-4 lg:w-[340px] xl:w-[380px]">
  <div className="flex gap-3">
    {team.drivers.map((driver, i) => (
      <BlurFade key={driver.id} delay={reducedMotion ? 0 : 0.1 * i} inView className="min-w-0 flex-1">
        <DriverPortrait
          driver={driver}
          team={team}
          priority={index === 0}
          className="aspect-[3/4] w-full"
        />
      </BlurFade>
    ))}
  </div>

  <BlurFade delay={reducedMotion ? 0 : 0.3} inView>
    <div className="flex items-center gap-3 pt-2">
      <TeamLogo team={team} size={20} />
      <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">{team.name}</span>
    </div>
  </BlurFade>
</div>
```

The `0.1 * i` stagger keeps the existing ~100ms rhythm between semantic chunks.

- [ ] **Step 4: Add the watermark**

Immediately after the existing ambient glow blob `motion.div`, add:

```tsx
{/* Oversized monogram bleeding off the leading edge. Decorative only. */}
<span
  data-testid="team-watermark"
  aria-hidden="true"
  className={cn(
    'pointer-events-none absolute top-8 select-none text-[14rem] font-black leading-none text-white opacity-[0.035]',
    blobOnRight ? '-left-10' : '-right-10',
  )}
>
  {team.shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()}
</span>
```

It sits opposite the glow blob so the two decorative layers do not stack on the same side.

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS. Lint catches the now-unused `Card`/`Badge` imports if they were missed.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/team-section.tsx frontend/tests/team-section.test.tsx
git commit -m "Turn the driver cards into duotone portraits behind a monogram watermark"
```

---

### Task 7: Hero — livery wall

**Files:**
- Modify: `frontend/components/teams/teams-hero.tsx`
- Test: `frontend/tests/teams-hero.test.tsx`

**Interfaces:**
- Consumes: `TeamLogo` (Task 2).
- Produces: `TeamsHero` gains one required prop — `onSelectTeam: (id: string) => void`. `teams-page-client.tsx` must pass its existing `scrollToTeam`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/teams-hero.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsHero } from '@/components/teams/teams-hero';
import { TEAMS } from '@/data/teams-data';

describe('TeamsHero', () => {
  it('renders one column per constructor', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /jump to /i })).toHaveLength(TEAMS.length);
  });

  it('keeps the title', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getByText(/the grid/i)).toBeInTheDocument();
  });

  it('scrolls to the team whose column is clicked', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsHero onSelectTeam={onSelectTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /jump to Ferrari/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('ferrari');
  });

  it('exposes columns as real buttons so they are keyboard reachable', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    for (const button of screen.getAllByRole('button', { name: /jump to /i })) {
      expect(button.tagName).toBe('BUTTON');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/teams-hero.test.tsx`
Expected: FAIL — no buttons named "jump to …" exist.

- [ ] **Step 3: Build the livery wall**

In `frontend/components/teams/teams-hero.tsx`, add the prop and replace the two ambient blob
divs with the wall. Keep `DotPattern`, the `Badge`, both `TextAnimate` blocks, the CTA, the
scroll cue, and the bottom gradient exactly as they are — layer the wall behind them.

```tsx
interface TeamsHeroProps {
  onSelectTeam: (id: string) => void;
}

export function TeamsHero({ onSelectTeam }: TeamsHeroProps) {
```

Insert immediately after the `DotPattern`:

```tsx
{/* Livery wall — one column per constructor, hidden on small viewports where
    eleven columns would be ~34px each. */}
<div className="pointer-events-none absolute inset-0 hidden lg:flex" aria-hidden="true">
  {TEAMS.map((team, i) => (
    <motion.div
      key={team.id}
      className="relative flex-1 origin-bottom"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, transform: 'scaleY(0)' }}
      animate={{ opacity: 1, transform: 'scaleY(1)' }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: 'spring', duration: 0.6, bounce: 0, delay: i * 0.06 }
      }
      style={{
        background: `linear-gradient(to top, ${team.color}22, transparent 65%)`,
      }}
    >
      <span
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ backgroundColor: team.color }}
      />
    </motion.div>
  ))}
</div>

{/* Clickable columns. Separate from the decorative layer above so those visual
    columns can stay aria-hidden while these carry the accessible names.

    ONE set of buttons, laid out responsively — full-height columns at lg and up,
    a four-across logo grid below. Rendering a second `lg:hidden` set instead would
    put 22 buttons in the DOM under jsdom, where no media query applies, and every
    getByRole in the test would throw on multiple matches. */}
<div
  className={cn(
    'absolute inset-x-0 bottom-16 grid grid-cols-4 justify-items-center gap-3 px-6',
    'lg:inset-0 lg:bottom-auto lg:flex lg:gap-0 lg:px-0',
  )}
>
  {TEAMS.map((team) => (
    <button
      key={team.id}
      onClick={() => onSelectTeam(team.id)}
      aria-label={`Jump to ${team.shortName}`}
      className={cn(
        'group relative transition-transform duration-150 active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:focus-visible:ring-inset',
        'lg:h-full lg:flex-1 lg:active:scale-100',
      )}
    >
      {/* Hover wash — lg only, where there is a column to wash. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:block"
        style={{ background: `linear-gradient(to top, ${team.color}44, transparent 70%)` }}
      />
      {/* Always visible below lg; revealed on hover at lg and up. */}
      <span className="relative flex justify-center lg:absolute lg:bottom-5 lg:left-0 lg:right-0 lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-hover:opacity-100">
        <TeamLogo team={team} size={30} />
      </span>
    </button>
  ))}
</div>
```

Hover reveal animates `opacity` only — never `flex`, which would re-run layout for all eleven
columns every frame. The visible width change from the mockup is deliberately dropped for
that reason; the colour wash and logo carry the affordance instead.

`cn` must be imported from `@/lib/utils` — the file does not currently import it.

Add `TEAMS` and `TeamLogo` to the imports; `TEAMS` is already imported for the CTA.

- [ ] **Step 4: Pass the prop from the page**

In `frontend/components/teams/teams-page-client.tsx`, change `<TeamsHero />` to:

```tsx
<TeamsHero onSelectTeam={scrollToTeam} />
```

`scrollToTeam` is already defined above it and already handles reduced motion.

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS. Typecheck fails loudly if the new required prop was not passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/teams/teams-hero.tsx frontend/components/teams/teams-page-client.tsx frontend/tests/teams-hero.test.tsx
git commit -m "Build the hero from eleven livery columns that double as navigation"
```

---

### Task 8: Nav rail — logo chips and standings

**Files:**
- Modify: `frontend/components/teams/teams-nav-rail.tsx`
- Test: `frontend/tests/teams-nav-rail.test.tsx`

**Interfaces:**
- Consumes: `TeamLogo` (Task 2), `Team.position`/`Team.points` (Task 1).
- Produces: no signature change. `TeamsNavRail` props stay `{ activeTeamId, onSelectTeam, mobile? }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/teams-nav-rail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';

describe('TeamsNavRail', () => {
  it('shows position and points for each team on desktop', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} />);
    expect(screen.getByText('P1 · 379 PTS')).toBeInTheDocument();
    expect(screen.getByText('P2 · 307 PTS')).toBeInTheDocument();
  });

  it('selects the team that was clicked', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={onSelectTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /mclaren/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
  });

  it('marks only the active team as current', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} />);
    const current = screen.getAllByRole('button', { current: true });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
  });

  it('drops points but keeps position in the mobile pills', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} mobile />);
    expect(screen.queryByText('P1 · 379 PTS')).not.toBeInTheDocument();
    expect(screen.getByText('P1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/teams-nav-rail.test.tsx`
Expected: FAIL — no `P1 · 379 PTS` text, and no `aria-current` on any button.

- [ ] **Step 3: Update the desktop button**

In `NavButton`'s desktop branch, add `aria-current={isActive ? 'true' : undefined}` to the
`<button>`, swap the colour dot for `<TeamLogo team={team} size={22} />`, and replace the
single team-name span with:

```tsx
<span className="relative z-10 min-w-0 flex-1">
  <span className="block truncate text-sm font-medium">{team.shortName}</span>
  <span
    className="block font-mono text-[9px] tracking-wide"
    style={{ color: isActive ? team.color : '#71717a' }}
  >
    {`P${team.position} · ${team.points} PTS`}
  </span>
</span>
```

Keep the existing `layoutId="teams-nav-active"` highlight, the left colour accent, the index
numeral, and the `focus-visible` ring exactly as they are.

- [ ] **Step 4: Update the mobile pill**

In the `mobile` branch, add `aria-current={isActive ? 'true' : undefined}` and append the
position after the name:

```tsx
{team.shortName}
<span className="ml-1.5 font-mono text-[9px] text-zinc-400">{`P${team.position}`}</span>
```

- [ ] **Step 5: Add the scroll-progress edge**

In the desktop `<nav>`, add a right-edge track. Progress is driven by the active team's index
so it needs no scroll listener:

```tsx
<span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-full w-[2px] bg-zinc-900">
  <span
    className="block w-full origin-top bg-zinc-600 transition-transform duration-300"
    style={{
      height: '100%',
      transform: `scaleY(${(TEAMS.findIndex((t) => t.id === activeTeamId) + 1) / TEAMS.length})`,
    }}
  />
</span>
```

Add `relative` to the `<nav>`'s className so the absolute track anchors to it.

- [ ] **Step 6: Run tests, typecheck and lint**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/teams/teams-nav-rail.tsx frontend/tests/teams-nav-rail.test.tsx
git commit -m "Give the nav rail logo chips, live standings and a progress edge"
```

---

### Task 9: Comparison — bar race

**Files:**
- Modify: `frontend/components/teams/teams-comparison-grid.tsx`
- Test: `frontend/tests/teams-comparison-grid.test.tsx`

**Interfaces:**
- Consumes: `TeamLogo` (Task 2), `Team.points`/`Team.position` (Task 1), `STANDINGS_AS_OF` (Task 1).
- Produces: no signature change. Props stay `{ teams, activeTeamId, reducedMotion, onScrollToTeam }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/teams-comparison-grid.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import { TeamsComparisonGrid } from '@/components/teams/teams-comparison-grid';
import { TEAMS } from '@/data/teams-data';

function renderGrid(onScrollToTeam = vi.fn()) {
  render(
    <TeamsComparisonGrid
      teams={TEAMS}
      activeTeamId="ferrari"
      reducedMotion={false}
      onScrollToTeam={onScrollToTeam}
    />,
  );
}

function rowNames() {
  return screen.getAllByRole('button', { name: /jump to /i }).map((b) =>
    b.getAttribute('aria-label'),
  );
}

describe('TeamsComparisonGrid', () => {
  it('ranks by points by default, leader first', () => {
    renderGrid();
    expect(rowNames()[0]).toMatch(/Mercedes/);
    expect(rowNames()[10]).toMatch(/Cadillac/);
  });

  it('re-sorts by championships when the Titles tab is chosen', () => {
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    // Ferrari has 16 championships, more than Mercedes' 8.
    expect(rowNames()[0]).toMatch(/Ferrari/);
  });

  it('re-sorts by debut year when the Since tab is chosen', () => {
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Since' }));
    expect(rowNames()[0]).toMatch(/Ferrari/); // 1950, the oldest entry
  });

  it('scales each bar against the leader', () => {
    renderGrid();
    const ferrariRow = screen.getByRole('button', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    // 307 / 379 ≈ 0.81
    expect(bar).toHaveStyle({ transform: 'scaleX(0.81)' });
  });

  it('scrolls to the team whose row is clicked', () => {
    const onScrollToTeam = vi.fn();
    renderGrid(onScrollToTeam);
    fireEvent.click(screen.getByRole('button', { name: /jump to McLaren/i }));
    expect(onScrollToTeam).toHaveBeenCalledWith('mclaren');
  });

  it('dates its own numbers', () => {
    renderGrid();
    expect(screen.getByText(/Round 11/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run tests/teams-comparison-grid.test.tsx`
Expected: FAIL — no sort tabs, no `bar-fill` testid.

- [ ] **Step 3: Rewrite the grid as a bar race**

Replace the body of `frontend/components/teams/teams-comparison-grid.tsx`, keeping the
section header, the `TextAnimate` heading, and the existing props:

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/utils';
import { STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { TeamLogo } from './team-logo';

type SortKey = 'points' | 'championships' | 'firstEntry';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'points', label: 'Points' },
  { key: 'championships', label: 'Titles' },
  { key: 'firstEntry', label: 'Since' },
];

interface TeamsComparisonGridProps {
  teams: Team[];
  activeTeamId: string;
  reducedMotion: boolean;
  onScrollToTeam: (id: string) => void;
}

export function TeamsComparisonGrid({
  teams,
  activeTeamId,
  reducedMotion,
  onScrollToTeam,
}: TeamsComparisonGridProps) {
  const [sort, setSort] = useState<SortKey>('points');

  const ranked = useMemo(() => {
    const copy = [...teams];
    // firstEntry sorts ascending (oldest first); the other two descending.
    copy.sort((a, b) => (sort === 'firstEntry' ? a[sort] - b[sort] : b[sort] - a[sort]));
    return copy;
  }, [teams, sort]);

  const leader = useMemo(
    () => Math.max(...teams.map((t) => t[sort === 'firstEntry' ? 'points' : sort]), 1),
    [teams, sort],
  );

  const handleSort = useCallback((key: SortKey) => setSort(key), []);

  return (
    <section className="bg-zinc-950 px-6 py-20 lg:px-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-500">Overview</p>
          <TextAnimate
            as="h2"
            animation={reducedMotion ? 'fadeIn' : 'slideUp'}
            by="word"
            startOnView
            once
            className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl"
          >
            Constructors&apos; Championship
          </TextAnimate>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          {STANDINGS_AS_OF}
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {SORTS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            aria-pressed={sort === key}
            className={cn(
              'rounded px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-[background-color,color,border-color] duration-200 active:scale-[0.96]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
              sort === key
                ? 'bg-zinc-800 text-white'
                : 'border border-zinc-800 text-zinc-500 hover:text-zinc-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {ranked.map((team, i) => {
          const metric = sort === 'firstEntry' ? team.points : team[sort];
          return (
            <motion.button
              key={team.id}
              layout={!reducedMotion}
              transition={
                reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
              }
              onClick={() => onScrollToTeam(team.id)}
              aria-label={`Jump to ${team.shortName}`}
              className={cn(
                'flex items-center gap-3 rounded px-2 py-2 text-left transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
                team.id === activeTeamId ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30',
              )}
            >
              <span className="w-5 flex-shrink-0 font-mono text-[11px] text-zinc-600">
                {i + 1}
              </span>
              <TeamLogo team={team} size={22} />
              <span className="w-24 flex-shrink-0 truncate text-xs font-medium text-white">
                {team.shortName}
              </span>

              <span className="h-[9px] min-w-0 flex-1 overflow-hidden bg-zinc-900">
                <span
                  data-testid="bar-fill"
                  className="block h-full origin-left transition-transform duration-700 ease-out"
                  style={{
                    backgroundColor: team.color,
                    transform: `scaleX(${Number((metric / leader).toFixed(2))})`,
                  }}
                />
              </span>

              <span className="w-10 flex-shrink-0 text-right font-mono text-sm font-bold text-white">
                {reducedMotion ? (
                  sort === 'firstEntry' ? team.firstEntry : metric
                ) : sort === 'firstEntry' ? (
                  team.firstEntry
                ) : (
                  <NumberTicker value={metric} className="text-sm text-white" />
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
```

Bars use `scaleX` on a fixed-width track — never `width` — so reordering and filling are both
compositor work. Rounding the scale to two decimals keeps the test assertion stable.

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/teams/teams-comparison-grid.tsx frontend/tests/teams-comparison-grid.test.tsx
git commit -m "Rank the constructors in a sortable bar race dated to its own round"
```

---

### Task 10: Full verification

**Files:** none created. This task proves the whole page works together.

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: nothing.

- [ ] **Step 1: Run the full suite**

Run: `cd frontend && mise exec -- pnpm test && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: all PASS. Baseline before this work was 43 tests; expect 43 plus the new ones.

- [ ] **Step 2: Build**

Run: `cd frontend && mise exec -- pnpm build`
Expected: build succeeds. This is the first check that `next/image` is happy with every path
and that no server component imports a `'use client'` module incorrectly.

- [ ] **Step 3: Confirm three.js left the initial page load**

Run: `cd frontend && mise exec -- pnpm build` and read the route table for `/teams`.
Expected: the First Load JS for `/teams` is **smaller** than before this branch. If it is not,
something still imports `F1HeroScene` eagerly — find it with
`grep -rn "f1-hero-scene" components/teams/`. Only `inspect-modal.tsx` should match.

- [ ] **Step 4: Look at the page**

Run: `cd frontend && mise exec -- pnpm dev`, open `http://localhost:3000/teams`, and check:
- Hero columns stagger up; hovering one reveals its logo; clicking scrolls to that team.
- Scrolling swaps the rail's logo, portraits and stats per team.
- Nav rail shows `P1 · 379 PTS` style lines and its progress edge advances.
- Bar race sorts by all three tabs and rows spring into their new order.
- Inspect still opens the 3D car.

Then re-check at a narrow viewport (~375px): the wall is a logo grid, the nav is pills, and
nothing overflows horizontally.

Then set the OS "reduce motion" preference and reload: everything should appear in its final
state with no stagger, no bar sweep, no row springing.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u frontend
git commit -m "Fix what the full-page pass turned up"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Data layer, `STANDINGS_AS_OF`, standings table | 1 |
| `seasonsSince`, `duotoneFor`, Haas white-livery case | 1 |
| `team-logo.tsx` with monogram fallback | 2 |
| `driver-portrait.tsx` with ghost-number fallback | 3 |
| Asset fetch script, `public/logos`, `public/drivers` | 4 |
| Rail → dossier stack; `sticky-car-viewer` renamed; 3D dropped from rail | 5 |
| Team sections → full-bleed portraits + watermark | 6 |
| Hero → livery wall, mobile logo grid | 7 |
| Nav rail → logo chip, position/points, progress edge, mobile pill | 8 |
| Comparison → bar race with three sort tabs | 9 |
| `inspect-modal.tsx` unchanged, sole 3D consumer | 5 (delete), 10 Step 3 (verified) |
| Reduced motion throughout | Global Constraints; 7, 9 explicitly; 10 Step 4 verifies |
| Test list | 2, 3, 5, 6, 7, 8, 9 |
| No `next.config.js` change | Global Constraints |

No gaps.

**Type consistency**

- `TeamLogo` takes `{ team, size, className? }` in Task 2 and is called with exactly those in Tasks 5, 6, 7, 8, 9.
- `DriverPortrait` takes `{ driver, team, priority?, className? }` in Task 3 and is called with exactly those in Tasks 5 and 6.
- `duotoneFor` returns `{ color, opacity, keyline }` in Task 1; Task 3 reads all three.
- `seasonsSince` is defined in Task 1 and used only in Task 5.
- `STANDINGS_AS_OF` is defined in Task 1 and used in Task 9.
- `TeamsHero` gains `onSelectTeam` in Task 7 and the call site is updated in the same task.

**Known deviation from the mockups**

The approved hero mockup expanded a column's width on hover. Task 7 drops the width change and
keeps only the colour wash and logo reveal, because animating `flex` re-runs layout for all
eleven columns every frame. This is the one place the plan knowingly diverges from what was
shown; flag it at review if the affordance feels too weak and it can be restored as a
`transform: scaleX` on the column's inner layer.

---

## Known deferred items (recorded at completion, 2026-08-04)

Everything below was found during execution, judged non-blocking, and deliberately not
fixed. Recorded here because the execution ledger it came from was scratch.

**Spec claims that did not land.** The spec says `STANDINGS_AS_OF` renders "in the comparison
section and the nav rail header"; the rail header is still the bare word "Constructors", which
is the one surface showing `P1 · 379 PTS` on every screen. The spec also says bars "sweep from
zero when the section scrolls in" — they paint at their final `scaleX` and only transition on a
sort-tab change, so the bar race's entrance animation never happens on arrival. `NumberTicker`
does count up. The spec's "active row gains a colour gradient" shipped as flat
`bg-zinc-800/60`.

**Asset caveats.** `alpine.svg`'s navy is legible-but-dim on `zinc-950` — a genuine brand
colour, not a missing-fill defect, so it was left alone. Ten of eleven logos are committed;
`racing-bulls` has none and renders a monogram tile. Several logo files were deliberately
recoloured to near-white because their paths carried no fill and rendered black on black;
`scripts/fetch-team-assets.mjs` documents that re-running it reverts them. That script also
requires macOS `sips` for its JPEG→PNG step.

**Pre-existing data staleness, out of this spec's scope.** `teams-data.ts` says "MoneyGram Haas
F1 Team" while `haas.svg` reads "TGR Haas"; `audi.svg` reads "Audi Revolut" and `williams.svg`
"Atlassian Williams". Team naming was never in scope here.

**Smaller things.** `monogram()` strips non-alphabetic characters then slices three, which only
works because every team's first word is at least three letters — a shorter first word would
leak into the second. The comparison rows' `active:scale-[0.96]` may be dead, since motion's
`layout` prop writes `transform` inline and inline beats a class; unverified in a browser. The
sticky panel's Inspect button is the last tab stop on the page (~38 stops in) despite sitting
visually top-right, because its `<aside>` follows the whole centre column. Below `lg` the hero's
bottom gradient paints over the logo grid, dimming the bottom row slightly. `TeamMonogramTile`
carries `role="img"` even where it sits inside a button whose `aria-label` overrides it.

**Never verified aesthetically.** Every check in this plan was mechanical. Stagger timing, hover
feel, sticky-rail scroll sync, sort-spring motion, and the narrow-viewport layout were confirmed
to *function* in a real browser but never judged as design.
