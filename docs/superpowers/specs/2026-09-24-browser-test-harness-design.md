# Real-browser test harness — design

**Date:** 2026-09-24 · **Base:** `main` @ `b0e0926` · **Branch:** `lc/browser-test-harness-ci-8e286a`

## Why

`pnpm test` runs under jsdom, which computes no CSS, lays nothing out, paints nothing and never
scrolls. CLAUDE.md records about a dozen defects that shipped green for that reason. They fall into
four classes:

1. **Rule never generated.** A Tailwind class no `content` glob reaches emits no rule. Examples are
   `focus-visible:ring-f1-red` falling back to `rgb(59 130 246 / 0.5)`, and `duration-[600ms]`
   running at 150ms.
2. **Contrast judged against the wrong backdrop.** `readableOnDark` has zero headroom, so any
   translucent layer drops text below 4.5:1. axe returns *incomplete* over blurred siblings.
3. **Colour/size token collision.** `sm:text-base` resolves to the `base` colour `#09090B` and
   paints text invisible on the page.
4. **Scroll/layout behaviour.** The IntersectionObserver scroll spy named the wrong section at 8 of
   31 positions.

The acceptance criterion: **the harness must go red when each documented defect is reintroduced.**
A class that can't be made to fail on demand is not covered.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Tool | Playwright `1.63.0`, `@axe-core/playwright` `4.13.0`, `pngjs` `7.0.0` | Assertions and exit codes, runs on Linux. No `sips`, no `sharp`. |
| Routes | `/teams`, `/tyres`, `/`, `/standings` (mocked API), `/candy` | Every documented defect lives on one of these. `/candy` is the styleguide. |
| Out of scope | `/teardown` (29 MB frames), `/showcase` (WebGL under SwiftShader), `/briefing`, `/credits` | Cost and flake risk with no documented defect behind them. Can be added as axe smoke later. |
| Gate | **Blocking** required check, job ≤ 5 min | A report-only gate gets ignored, which is how this repo already fails. |
| Retries | `retries: 1` in CI, `0` locally | Absorbs infrastructure flakes. A spec that needs the retry is reported as flaky. |
| Viewports | Per-spec widths: 1440 default; `/teams` at 390, 1100 and 1440 | `/teams` has three layouts (`lg` rail, `xl` dossier, mobile chips). No blanket matrix. |
| Contrast expectation | WCAG floor + site label: `expectContrast(loc, { atLeast: AA_SMALL_TEXT, site })` | States intent. The failure message prints the measured ratio and both colours. Nothing pinned. |
| Visual-diff screenshots | **Not used** | See below. |
| CI topology | A third `browser` job, parallel to `backend` and `frontend` | Wall-clock is the longer job, not the sum, and each failure is named by its job. |
| Mutation proof | Committed patches plus a runner, run locally and weekly / on `workflow_dispatch` | Keeps "goes red" true after this PR. Each mutant rebuilds, so it is too slow to run on every PR. |

### Against screenshot diffing as the gate

The defects here were "a rule is absent", "the ratio is 3.95:1" and "the wrong section is active".
Each of those can be asserted directly against a named expected value. A diff only says that pixels
moved, with no cause. It churns on font hinting, anti-aliasing and animation timing. And a golden
image captured on a broken tree *blesses* the bug, which is exactly how a missing ring or
invisible text would get baselined. `toHaveScreenshot` is not used.

## Layout

All paths are under `frontend/`.

```
playwright.config.ts
browser/                       # new top-level dir → added to next.config.js eslint.dirs
  support/
    pixels.ts                  # backdropBehindGlyphs()
    contrast.ts                # expectContrast(), wcagRatio(), AA_SMALL_TEXT, AA_NON_TEXT
    css.ts                     # ringColor(), computed(), hasRule()
    api-mocks.ts               # page.route('**/api/**') from tests/fixtures
    invisible-text.ts          # sweep for text whose colour matches its opaque backdrop
  focus-rings.spec.ts
  transition-tokens.spec.ts
  team-contrast.spec.ts
  invisible-text.spec.ts
  scroll-spy.spec.ts
  a11y-smoke.spec.ts
  mutations/
    README.md                  # what each patch reintroduces, and which spec must go red
    *.patch
scripts/run-mutants.mjs
```

Isolation:

- Vitest includes only `tests/**/*.test.ts(x)`, so it never sees `browser/`.
- Playwright uses `testDir: 'browser'` with `testMatch: '**/*.spec.ts'`, so it never sees `tests/`.
- `tsconfig.json`'s `**/*.ts` already typechecks `browser/`.

Scripts:

- `test:browser`: `playwright test`
- `test:browser:mutants`: `node scripts/run-mutants.mjs`

### `playwright.config.ts`

- Chromium only.
- `webServer`: `pnpm start --port 3100`, with `reuseExistingServer` off in CI. The build is a
  separate step, so the suite always runs against a production bundle.
- `use.reducedMotion: 'reduce'` by default, which settles BlurFade and other entrance motion. Specs
  that need motion running opt out per test.
- `use.baseURL: http://localhost:3100`.
- Reporter: `list` locally; `github` plus `html` in CI (HTML uploaded on failure).

## Support modules

### `pixels.ts` — `backdropBehindGlyphs(locator)`

This ports CLAUDE.md's method (hide the glyphs, screenshot, read the pixel behind them) to
JavaScript.

1. Resolve the painted glyph node. If the locator's box is ≤ 1px in either dimension, or its
   computed style matches `sr-only` (clip/1px), **throw**. This is trap 2: `TextAnimate`'s `sr-only`
   copy sits beside `aria-hidden` painted spans, and measuring it reports 1:1.
2. Set `color: transparent !important; text-shadow: none !important` on the node and its
   descendants through an injected style with a unique data attribute. This replaces
   `visibility: hidden` so that an element's **own `background-color` stays painted** (trap 1:
   `visibility` hid a monogram tile's fill along with its text).
3. Wait two rAFs, then `locator.screenshot()` into a Buffer and decode it with `PNG.sync.read`.
4. Return the per-channel **median** over the clip. This is robust to leftover anti-aliasing and
   to gradient edges.
5. Remove the injected style.

The text colour comes from `getComputedStyle(node).color` on the same painted node, composited over
the sampled backdrop if it has alpha.

### `contrast.ts`

- `wcagRatio(rgbA, rgbB)` uses the WCAG 2.x relative-luminance formula.
- `AA_SMALL_TEXT = 4.5`; `AA_NON_TEXT = 3`.
- `expectContrast(locator, { atLeast, site })` fails with:
  `"<site>": 4.02:1 < 4.5 (text rgb(…) on backdrop rgb(…))`.

### `css.ts`

- `ringColor(locator)` parses the ring layer out of the computed `box-shadow`.
- `computed(locator, prop)`.
- `hasRule(page, selectorText)` scans `document.styleSheets`.

### `api-mocks.ts`

Routes these requests to fixtures that already exist in `tests/fixtures/`:

- `/api/races/:year` → `races-2026.json`
- `/api/standings/2026` → `standings-2026.json`
- `/api/standings/2024` → `standings-2024.json`

Anything else under `/api/` fails the test, so a new endpoint can't silently go unmocked.

### `invisible-text.ts`

For every visible element with a direct non-whitespace text node, skipping `aria-hidden` subtrees'
`sr-only` twins:

1. Compare the computed `color` against the nearest ancestor's opaque `background-color`, falling
   back to the page `body` background.
2. Flag the element if the ratio is < 1.5.

This is independent of axe and catches the `text-base` case even where axe marks a node
*incomplete*.

## Specs

| Spec | Route · width | Asserts | Class |
|---|---|---|---|
| `focus-rings` | `/` 1440 | Keyboard-Tab to the red CTA (`focusRingOnRedFill`): the ring colour is `ink` and never `rgb(59 130 246 / 0.5)`. A `focusRing` control on `base`: the ring is `f1-red`. `hasRule` finds `.focus-visible\:ring-f1-red:focus-visible`. | 1 |
| `focus-rings` | `/candy` 1440 | The focusable controls on the styleguide have non-default ring colours | 1 |
| `transition-tokens` | `/` 1440, motion on | The `landing-section-theme` wrapper computes `transition-duration: 0.6s`, not `0.15s` | 1 |
| `team-contrast` | `/teams` 1100 | The active rail row's standing text is ≥ `AA_SMALL_TEXT` against pixels (backdrop `bg-zinc-800/60`) | 2 |
| `team-contrast` | `/teams` 1440 | The compare-tray value (`bg-zinc-900/60`) and the section standing line (over the glow) are both ≥ `AA_SMALL_TEXT`, for at least 3 teams including Alpine and Racing Bulls | 2 |
| `invisible-text` | `/teams` 390 and 1440, `/tyres`, `/candy`, `/standings` | The sweep finds nothing, and axe `color-contrast` has zero violations | 3 |
| `scroll-spy` | `/teams` 1100 | Scroll to ~30 positions across the page. For each, compute the expected section from live rects using the documented rule (most coverage of the band near the top, ties go to document order), then assert that the rail's `aria-current` names it. | 4 |
| `a11y-smoke` | all 5 in-scope routes | axe (WCAG 2 A/AA tags) reports zero violations. Any baseline exclusion is written down with a reason. | cross-cutting |

The team-contrast selectors are chosen during implementation from the live DOM, and each spec
cites the helper it guards.

## Mutation proof

Each file in `browser/mutations/` is a `git diff`-format patch paired with the specs that must fail.

| Patch | Reintroduces | Must fail |
|---|---|---|
| `01-tailwind-content-no-lib.patch` | drops `./lib/**` from `content` | `focus-rings` |
| `02-duration-arbitrary.patch` | `duration-600` → `duration-[600ms]` in `landing-section-theme.tsx` | `transition-tokens` |
| `03-rail-readable-on-dark.patch` | `railStandingColor` → `readableOnDark` in `sticky-team-panel` or the rail | `team-contrast` |
| `04-sm-text-base.patch` | `sm:text-base` on a `/teams` body paragraph | `invisible-text` |
| `05-scroll-spy-intersection-observer.patch` | `use-scroll-spy.ts` as of `4743f45` (IntersectionObserver) | `scroll-spy` |

`scripts/run-mutants.mjs` does the following for each patch:

1. Refuse to start on a dirty tree.
2. `git apply` the patch.
3. `pnpm build`.
4. Run the named spec(s).
5. Record the result: **a mutant that passes is a harness failure.**
6. `git checkout -- .` to restore the tree.

It exits non-zero if any mutant survives. Workflow: `.github/workflows/browser-mutants.yml`, on
weekly `schedule` and `workflow_dispatch`.

If a patch stops applying because the code moved, the runner fails loudly. The patch then has to be
regenerated, not deleted.

## CI — `browser` job in `ci.yml`

1. checkout
2. `pnpm/action-setup@v4` (11.8.0)
3. `setup-node` 24.17.0 with pnpm cache
4. `pnpm install --frozen-lockfile`
5. Read the Playwright version from `node_modules/@playwright/test/package.json`.
6. `actions/cache` on `~/.cache/ms-playwright`, keyed `playwright-${{ runner.os }}-<version>`.
7. On a cache miss: `pnpm exec playwright install --with-deps chromium`. On a hit:
   `pnpm exec playwright install-deps chromium`. The OS packages aren't cacheable this way.
8. `pnpm build`
9. `pnpm test:browser`
10. On failure: upload `playwright-report/` as an artifact.

`NEXT_PUBLIC_API_URL` is left at its default (`http://localhost:8000`). Nothing listens there
because every `/api/` call is intercepted by `page.route`.

## pnpm build approvals

Playwright's packages may declare install scripts. After install, run `pnpm typecheck` and read
any `ERR_PNPM_IGNORED_BUILDS`. Add exactly the packages it names to `allowBuilds` in
`pnpm-workspace.yaml`, with a comment saying why, or record that none were needed. The browser
download is an explicit CI step, never a postinstall.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` still pass, and `pnpm test` does not pick up `browser/`.
- `pnpm build && pnpm test:browser` pass on a green tree.
- `pnpm test:browser:mutants` kills all 5 mutants, and the failing output goes into the PR.
- `pnpm lint` actually reads `browser/`. Prove it with a deliberate lint error that must fail.
- A clean CI run on the PR shows the `browser` job within budget, with the browser cache hit on the
  second run.

## Docs

Add a CLAUDE.md entry covering the harness:

- what it gates
- how to run it
- the pixel method's two traps as ported
- the mutation runner and when to regenerate a patch

Flag, without rewriting, that the Soft 3.95:1 tracked-row example no longer has a call site
(`compoundTextOnTrackedRow` is unused since the tyres redesign).
