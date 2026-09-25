# Results

## Full run

Date: 2026-09-25
Commit: `14144a04670e53067d4138be8d9bd988f2b38e5b`
Run: `pnpm test:browser:mutants` (all five, Task 10 Step 2 full verification)

```
┌─────────┬─────────────────────────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                                       │ outcome  │ detail      │
├─────────┼─────────────────────────────────────────────┼──────────┼─────────────┤
│ 0       │ '01-tailwind-content-no-lib.patch'          │ 'killed' │ 'failed: 4' │
│ 1       │ '02-duration-arbitrary.patch'               │ 'killed' │ 'failed: 1' │
│ 2       │ '03-rail-readable-on-dark.patch'            │ 'killed' │ 'failed: 1' │
│ 3       │ '04-sm-text-base.patch'                     │ 'killed' │ 'failed: 1' │
│ 4       │ '05-scroll-spy-intersection-observer.patch' │ 'killed' │ 'failed: 1' │
└─────────┴─────────────────────────────────────────────┴──────────┴─────────────┘
```

All five `killed`. The runner rebuilt the unmutated tree afterwards; `git status --porcelain`
was empty.

## History

## 01, 02

Date: 2026-09-25
Commit: `8b35f7093e47d471f62604d2dcd5dadc6179b554`
Run: `pnpm test:browser:mutants 01 02` (after fixing the runner's fake-kill/ENOENT/unchecked-rebuild
findings — see below)

```
┌─────────┬────────────────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                              │ outcome  │ detail      │
├─────────┼────────────────────────────────────┼──────────┼─────────────┤
│ 0       │ '01-tailwind-content-no-lib.patch' │ 'killed' │ 'failed: 4' │
│ 1       │ '02-duration-arbitrary.patch'      │ 'killed' │ 'failed: 1' │
└─────────┴────────────────────────────────────┴──────────┴─────────────┘
```

Both mutants `killed`. Under mutant 01, exactly the 4 tests in its (now-scoped) `mustFail` failed:

- `the red-filled hero CTA takes the ink ring`
- `no focusable control on / paints Tailwind's default blue ring`
- `no focusable control on /teams paints Tailwind's default blue ring`
- `no focusable control on /tyres paints Tailwind's default blue ring`

`a flush control on base takes the red ring` passed (1 passed) under mutant 01, as expected — it
is no longer in `mustFail`; see `README.md` for why it stays in the suite as a guard without being
part of this mutant's kill condition.

**First run (2026-09-24) had mutant 01 `survived`.** `mustFail` originally listed both
`the red-filled hero CTA takes the ink ring` and `a flush control on base takes the red ring`. The
second title stayed passing under the mutation because `focus-visible:ring-f1-red` is also written
literally in `components/tyres/acts/tyre-archive.tsx` and `source-list.tsx`, both still inside
`content` with the mutation applied, so that rule is generated regardless of whether `lib/` is
scanned — only `focus-visible:ring-ink`, which appears nowhere outside `lib/focus.ts`, actually
goes missing. `mutants.json`'s `mustFail` for 01 was rescoped to the four titles that genuinely
depend on `lib/` being in `content` (commit `496fd3e`), which is why this run kills cleanly.

**Fix round 1 (2026-09-25, commit `8b35f70`).** Review found the runner itself could fake a kill:
it never checked for a global Playwright failure (webServer never booted, global setup crashed)
before trusting spec-level `ok`, so a uniform infra failure across every test could read as every
`mustFail` title failing "for the right reason." A missing/unparseable JSON report also threw
`ENOENT` out of the mutant loop, aborting the whole run — no table, later mutants skipped, final
rebuild never attempted — and the final clean-tree rebuild's own exit status was never checked.
`classifyMutant` now treats a report's top-level `errors` as its own `error` outcome (checked
first), only counts a title as a kill if it genuinely executed with status `failed`/`timedOut`,
wraps the report read in its own `try`/`catch` so a missing file becomes `error` and the `finally`
patch-revert still runs, and the final rebuild's failure now exits 1 with a clear message. The
table above is the re-run against the fixed runner; both mutants are still `killed`.

## 03

Date: 2026-09-25
Commit: `bfa616aa4a8065a1108a7c59edab5b793f0c6af8`
Run: `pnpm test:browser:mutants 03`

```
┌─────────┬──────────────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                            │ outcome  │ detail      │
├─────────┼──────────────────────────────────┼──────────┼─────────────┤
│ 0       │ '03-rail-readable-on-dark.patch' │ 'killed' │ 'failed: 1' │
└─────────┴──────────────────────────────────┴──────────┴─────────────┘
```

`killed`. `every team, active in the rail and in its section, clears AA` failed, with seven of
the eleven rail rows under 4.5:1 (soft assertions, so all seven are reported in one run rather
than stopping at the first):

```
rail active row (railStandingColor over bg-zinc-800/60), Ferrari: 4.03:1, needs 4.5:1 (text rgb(246, 0, 0) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Red Bull: 4.04:1, needs 4.5:1 (text rgb(81, 108, 255) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Racing Bulls: 3.95:1, needs 4.5:1 (text rgb(77, 124, 176) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Audi: 3.94:1, needs 4.5:1 (text rgb(242, 0, 47) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Williams: 4.00:1, needs 4.5:1 (text rgb(36, 113, 255) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Cadillac: 3.94:1, needs 4.5:1 (text rgb(237, 25, 60) on backdrop rgb(27, 27, 29))
rail active row (railStandingColor over bg-zinc-800/60), Aston Martin: 3.98:1, needs 4.5:1 (text rgb(0, 137, 121) on backdrop rgb(27, 27, 29))
```

Ferrari's 4.03:1 matches CLAUDE.md's recorded 4.02:1 for `readableOnDark` against the rail's
`bg-zinc-800/60` composite, within measurement noise. The other four teams (Mercedes, McLaren,
Alpine, Haas) stayed at or above 4.5:1 under the mutation and did not appear in the failure list.
The unmutated (green) tree passed both tests 2/2 (`pnpm exec playwright test
browser/team-contrast.spec.ts`, 6.5s) before this mutant was generated — no selector or floor was
touched to make this kill happen. `pnpm test:browser:mutants 03` rebuilt the clean tree
afterwards; `git status --porcelain` was empty.

## 04

Date: 2026-09-25
Commit: `ecf6ee50b893b370b66deb5d3ccd55c1baae66ef`
Run: `pnpm test:browser:mutants 04`

```
┌─────────┬─────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                   │ outcome  │ detail      │
├─────────┼─────────────────────────┼──────────┼─────────────┤
│ 0       │ '04-sm-text-base.patch' │ 'killed' │ 'failed: 1' │
└─────────┴─────────────────────────┴──────────┴─────────────┘
```

`killed`. Exactly the one title in `mustFail`, `/teams at 1440px paints no text in its own
backdrop colour`, failed — with all eleven team taglines reported, each at `rgb(9, 9, 11)` on
`rgb(9, 9, 11)` (1.00:1), e.g.:

```
"The Silver Arrows reborn — a new era, a new voice." rgb(9, 9, 11) on rgb(9, 9, 11) (1.00:1)
  at main:nth-child(2) > div:nth-child(1) > div:nth-child(3) > div:nth-child(3) > section:nth-child(1)
  > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > p:nth-child(1)
```

(...one such line per team, sections 1-11.) `/teams at 390px paints no text in its own backdrop
colour` **passed** — it was not in `mustFail` and did not fail — which proves the sweep is
breakpoint-true: `sm:text-base` is a no-op below the `sm` breakpoint (640px), so the 390px
viewport never hits the mutated rule and the tagline stays `text-zinc-300`. The four other
routes (`/`, `/tyres`, `/candy`, `/standings`) were unaffected, as expected — the mutation only
touches `components/teams/team-section.tsx`. `pnpm test:browser:mutants 04` rebuilt the clean
tree afterwards; `git status --porcelain` was empty.

This run followed four unrelated shipped-defect fixes made earlier in the same session —
DoubleMarquee's and `landing-how-it-works.tsx`'s numerals off a sub-3:1 `zinc-600`, `EYEBROW_RED`'s missing
`base-warm` variant, and `LifecycleStepper`'s inherited-transition flash — all committed
separately before this harness's own files were committed, so this mutant run is against a tree
where `browser/invisible-text.spec.ts` and `browser/a11y-smoke.spec.ts` both pass clean
(`11 passed`) on the unmutated tree.

## 05

Date: 2026-09-25
Commit: `c13b63b2cced6094f01acc33094bd2c1d639b0c3`
Run: `pnpm test:browser:mutants 05`

```
┌─────────┬─────────────────────────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                                       │ outcome  │ detail      │
├─────────┼─────────────────────────────────────────────┼──────────┼─────────────┤
│ 0       │ '05-scroll-spy-intersection-observer.patch' │ 'killed' │ 'failed: 1' │
└─────────┴─────────────────────────────────────────────┴──────────┴─────────────┘
```

`killed`. Exactly the one title in `mustFail`, `the rail names the section covering most of the
band at every sampled scroll position`, failed. The spec's own final assertion reported:

```
Error: 5 of 31 sampled positions named the wrong section

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 5
```

(CLAUDE.md measured 8 of 31 for this defect; the count is deterministic per code path and the
band/`STEP_PX` were not tuned to reach either number.) Before the mutant, three green-tree runs of `browser/scroll-spy.spec.ts` alone passed `1 passed`
each (5.5s, 5.2s, 5.1s), with no flake, confirming the spec is stable against the real hook.
`pnpm test:browser:mutants 05` rebuilt the clean tree afterwards; `git status --porcelain` was
empty.
