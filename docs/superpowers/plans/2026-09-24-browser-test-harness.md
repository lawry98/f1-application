# Real-Browser Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Playwright suite that fails on the four defect classes CLAUDE.md records jsdom missing, gates PRs in CI, and proves its own coverage by killing five committed mutants.

**Architecture:** `frontend/browser/` holds `*.spec.ts` files run by Playwright against `next start` on a production build. Pure colour maths is separate from browser helpers: pixels via pngjs, computed CSS, a DOM sweep and API mocks. `scripts/run-mutants.mjs` applies each `browser/mutations/*.patch`, rebuilds, and requires named tests to fail. CI adds a parallel `browser` job and a weekly mutants workflow.

**Tech Stack:** `@playwright/test` 1.63.0 (Chromium only), `@axe-core/playwright` 4.13.0, `pngjs` 7.0.0 + `@types/pngjs` 7.0.0, Next 14.2.18 production build, pnpm 11.8.0, Node 24.17.0.

**Spec:** `docs/superpowers/specs/2026-09-24-browser-test-harness-design.md`

## Global Constraints

- pnpm only. Run every command from `frontend/` via `mise exec -- pnpm …`, or with `/Users/lawrencecrasto/.local/share/mise/installs/node/24.17.0/bin` on PATH.
- Exact versions: `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0`, `pngjs@7.0.0`, `@types/pngjs@7.0.0`. **No `sharp`, no `sips`, no BMP, no temp image files.**
- Files are kebab-case. Exports are named. Configs are the only `default export`s (`playwright.config.ts`, as Playwright requires).
- `tsconfig.json` has `strict` + `noUncheckedIndexedAccess`. Array index reads are `T | undefined` and must be handled.
- ESLint: `no-console` is a warning outside `scripts/**/*.mjs`. `@typescript-eslint/no-explicit-any` is an error.
- Browser specs live only in `frontend/browser/`, matching `**/*.spec.ts`. Vitest (`tests/**/*.test.ts(x)`) must never pick them up, and Playwright must never pick up `tests/`.
- No screenshot-diff (`toHaveScreenshot`) anywhere.
- A contrast assertion names a WCAG floor plus a site label: `expectContrast(loc, { atLeast: AA_SMALL_TEXT, site })`. Never a pinned ratio.
- CI stays `ubuntu-latest` with Node `24.17.0`, pnpm `11.8.0` via `pnpm/action-setup@v4`, and the browser job ≤ 5 min.
- Base commit `b0e0926` (current `main`). Branch `lc/browser-test-harness-ci-8e286a`.
- The SD500 volume drops under heavy delete I/O. Don't `rm -rf node_modules` or `.next` in bulk; let `next build` overwrite `.next`.

## File map

| File | Responsibility |
|---|---|
| `frontend/playwright.config.ts` | Chromium project, `webServer` on :3100, reduced motion by default |
| `frontend/browser/support/color.ts` | Pure: parse CSS colour, WCAG luminance/ratio, alpha composite, format |
| `frontend/browser/support/color.spec.ts` | Unit spec for `color.ts` (no page) |
| `frontend/browser/support/pixels.ts` | `backdropBehindGlyphs()`, `medianPixel()` |
| `frontend/browser/support/contrast.ts` | `measureContrast()`, `expectContrast()`, `AA_SMALL_TEXT`, `AA_NON_TEXT` |
| `frontend/browser/support/css.ts` | `focusByKeyboard()`, `focusState()`, `tabThroughPage()`, `hasRule()`, `TAILWIND_DEFAULT_RING` |
| `frontend/browser/support/invisible-text.ts` | `findInvisibleText()`, `INVISIBLE_BELOW` |
| `frontend/browser/support/api-mocks.ts` | `mockApi(page)` using `tests/fixtures` |
| `frontend/browser/support/test.ts` | `test`/`expect` with an auto API-mock fixture |
| `frontend/browser/harness-self-test.spec.ts` | Proves the pixel/contrast helpers and both traps on synthetic pages |
| `frontend/browser/focus-rings.spec.ts` | Class 1 (ring rules) |
| `frontend/browser/transition-tokens.spec.ts` | Class 1 (`duration-600`) |
| `frontend/browser/team-contrast.spec.ts` | Class 2 |
| `frontend/browser/invisible-text.spec.ts` | Class 3 (sweep) |
| `frontend/browser/a11y-smoke.spec.ts` | axe, WCAG A/AA, 5 routes |
| `frontend/browser/scroll-spy.spec.ts` | Class 4 |
| `frontend/browser/mutations/mutants.json` | Manifest: patch → specs → titles that must fail |
| `frontend/browser/mutations/0N-*.patch` | Five defect reintroductions |
| `frontend/browser/mutations/README.md` | How to regenerate a patch |
| `frontend/scripts/run-mutants.mjs` | Mutation runner |
| `frontend/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | deps, scripts, build approvals |
| `frontend/next.config.js` | add `browser` to `eslint.dirs` |
| `frontend/.gitignore` | Playwright output dirs |
| `.github/workflows/ci.yml` | `browser` job |
| `.github/workflows/browser-mutants.yml` | weekly + manual mutants run |
| `Makefile` | `test-browser`, `test-mutants` dispatch targets |
| `CLAUDE.md` | harness section |

---

### Task 1: Scaffold Playwright, isolated from Vitest and seen by lint

**Files:**
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/pnpm-workspace.yaml` (only if pnpm names a package), `frontend/next.config.js`, `frontend/.gitignore`
- Create: `frontend/playwright.config.ts`, `frontend/browser/harness-smoke.spec.ts`

**Interfaces:**
- Produces:
  - `pnpm test:browser` runs `playwright test`.
  - `pnpm test:browser:mutants` runs `node scripts/run-mutants.mjs` (the script lands in Task 5).
  - `baseURL` is `http://localhost:3100`.
  - The default `reducedMotion` is `'reduce'`.

- [ ] **Step 1: Install the pinned dev deps**

```bash
cd frontend && mise exec -- pnpm add -D --save-exact @playwright/test@1.63.0 @axe-core/playwright@4.13.0 pngjs@7.0.0 @types/pngjs@7.0.0
```

- [ ] **Step 2: Find out whether pnpm blocked a build script**

Run: `cd frontend && mise exec -- pnpm typecheck`

- If it prints `ERR_PNPM_IGNORED_BUILDS`, add **exactly** the named packages to `allowBuilds` in `frontend/pnpm-workspace.yaml`, following the existing comment style:

```yaml
allowBuilds:
  unrs-resolver: true
  # <package>: <one line on what its script does and why the harness needs it>
  <package>: true
```

- If it passes, add nothing, and note "no build approvals needed" for the commit message.
- Never add `playwright install` as a postinstall. The browser download is an explicit step.

- [ ] **Step 3: Install Chromium locally**

Run: `cd frontend && mise exec -- pnpm exec playwright install chromium`
Expected: downloads into `~/Library/Caches/ms-playwright` on the internal disk, not SD500.

- [ ] **Step 4: Write `frontend/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * The real-browser gate. jsdom computes no CSS, lays nothing out and never scrolls, so every
 * defect class CLAUDE.md records as "shipped green" is only visible here.
 *
 * It always runs against a **production** bundle: `pnpm build` is a separate, explicit step
 * (CI does it; locally, run it after any source change). A dev server would compile Tailwind
 * on demand and could disagree with what ships.
 *
 * `reuseExistingServer` is off on purpose, everywhere. A reused server on :3100 would be
 * serving whatever was built last — after a mutant run, a *mutated* bundle — and the suite
 * would report on code that is not in the tree.
 */
export default defineConfig({
  testDir: 'browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    // Settles BlurFade, the rail cascade and Lenis (`SmoothScroll` stops under `reduce`), so a
    // measurement never lands mid-animation. Specs that need motion opt out per test.
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'pnpm start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

- [ ] **Step 5: Write the smoke spec `frontend/browser/harness-smoke.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('the production server serves the landing page with its stylesheet applied', async ({ page }) => {
  await page.goto('/');
  // A computed value, not a class: if Tailwind's CSS failed to load this is the browser default.
  const bg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});
```

- [ ] **Step 6: Scripts, gitignore, lint dirs**

In `frontend/package.json` `scripts`, after `"test:watch"`:

```json
"test:browser": "playwright test",
"test:browser:mutants": "node scripts/run-mutants.mjs",
```

Append to `frontend/.gitignore`:

```
# playwright
/test-results/
/playwright-report/
/blob-report/
```

In `frontend/next.config.js`, update the comment and dirs:

```js
  // `next lint` otherwise only walks its own default set of directories, which silently
  // excludes tests/, browser/ and scripts/ — lint passes while those files are never looked at.
  eslint: {
    dirs: ['app', 'browser', 'components', 'data', 'hooks', 'lib', 'scripts', 'types', 'tests'],
  },
```

- [ ] **Step 7: Build and run the smoke spec**

Run: `cd frontend && mise exec -- pnpm build && mise exec -- pnpm test:browser`
Expected: `1 passed`.

- [ ] **Step 8: Prove the isolation and lint claims**

- Run `cd frontend && mise exec -- pnpm test 2>&1 | tail -5`. The reported test-file count must equal `ls tests/*.test.ts* | wc -l`. No `browser/` file may appear.
- Run `cd frontend && mise exec -- pnpm exec playwright test --list | grep -c "tests/"`. Expected: `0`.
- Temporarily append `debugger;` to `browser/harness-smoke.spec.ts` and run `mise exec -- pnpm lint`. Expected: **error** `no-debugger` in `browser/harness-smoke.spec.ts`. Remove the line and re-run `pnpm lint`; it should pass.
- Run `mise exec -- pnpm typecheck`. Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/next.config.js frontend/.gitignore frontend/playwright.config.ts frontend/browser/harness-smoke.spec.ts
git commit -m "test(browser): scaffold a Playwright harness against the production build"
```

---

### Task 2: Pure colour maths

**Files:**
- Create: `frontend/browser/support/color.ts`
- Test: `frontend/browser/support/color.spec.ts`

**Interfaces:**
- Produces:
  - `interface Rgb { r: number; g: number; b: number }` and `interface Rgba extends Rgb { a: number }`
  - `parseCssColor(value: string): Rgba`
  - `relativeLuminance(c: Rgb): number`
  - `wcagRatio(a: Rgb, b: Rgb): number`
  - `composite(top: Rgba, bottom: Rgb): Rgb`
  - `formatCssColor(c: Rgba | Rgb): string`, which gives `rgb(r, g, b)` when alpha is 1 or absent, else `rgba(r, g, b, a)`. This matches Chromium's computed serialisation.

- [ ] **Step 1: Write the failing spec**

```ts
import { expect, test } from '@playwright/test';

import { composite, formatCssColor, parseCssColor, wcagRatio } from './color';

test.describe('color', () => {
  test('parses legacy, modern and percentage-alpha rgb()', () => {
    expect(parseCssColor('rgb(225, 6, 0)')).toEqual({ r: 225, g: 6, b: 0, a: 1 });
    expect(parseCssColor('rgba(59, 130, 246, 0.5)')).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
    // What `getPropertyValue('--tw-ring-color')` returns once `var(--tw-ring-opacity, 1)` resolves.
    expect(parseCssColor('rgb(244 244 237 / 1)')).toEqual({ r: 244, g: 244, b: 237, a: 1 });
    expect(parseCssColor('rgb(59 130 246 / 50%)')).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
    expect(() => parseCssColor('oklch(0.5 0.1 20)')).toThrow(/not an rgb/);
  });

  test('computes WCAG 2 contrast ratios', () => {
    expect(wcagRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5);
    expect(wcagRatio({ r: 0x76, g: 0x76, b: 0x76 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(4.54, 2);
    // lib/focus.ts: "f1-red against base #09090B — 4.01".
    expect(wcagRatio({ r: 225, g: 6, b: 0 }, { r: 9, g: 9, b: 11 })).toBeCloseTo(4.01, 2);
    // Order-independent.
    expect(wcagRatio({ r: 9, g: 9, b: 11 }, { r: 225, g: 6, b: 0 })).toBeCloseTo(4.01, 2);
  });

  test('composites a translucent layer the way the rail row is painted', () => {
    // lib/focus.ts: bg-zinc-800/60 over the page composites to #1b1b1e, not to zinc-800.
    const zinc800at60 = { r: 39, g: 39, b: 42, a: 0.6 };
    expect(formatCssColor(composite(zinc800at60, { r: 9, g: 9, b: 11 }))).toBe('rgb(27, 27, 30)');
  });

  test('formats like Chromium serialises computed colours', () => {
    expect(formatCssColor({ r: 225, g: 6, b: 0 })).toBe('rgb(225, 6, 0)');
    expect(formatCssColor({ r: 59, g: 130, b: 246, a: 0.5 })).toBe('rgba(59, 130, 246, 0.5)');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/support/color.spec.ts`
Expected: FAIL, `Cannot find module './color'`.

- [ ] **Step 3: Implement `frontend/browser/support/color.ts`**

```ts
/**
 * Colour arithmetic for the browser harness. Pure, so it runs without a page.
 *
 * Deliberately **not** imported from `lib/team-utils.ts`: the harness checks the page against
 * WCAG, and a check built from the helpers it is checking would agree with them by construction.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rgba extends Rgb {
  a: number;
}

const RGB_FUNCTION = /^rgba?\(\s*([^)]+)\)$/i;

/**
 * Parses what Chromium hands back from `getComputedStyle`: legacy `rgb(1, 2, 3)` /
 * `rgba(1, 2, 3, 0.5)` for real properties, and modern `rgb(1 2 3 / 0.5)` for custom properties
 * such as `--tw-ring-color`, which keep their authored syntax.
 */
export function parseCssColor(value: string): Rgba {
  const body = RGB_FUNCTION.exec(value.trim())?.[1];
  if (body === undefined) throw new Error(`parseCssColor: not an rgb() colour: "${value}"`);
  const [r, g, b, a] = body.split(/[\s,/]+/).filter(Boolean);
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`parseCssColor: expected three channels in "${value}"`);
  }
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number.parseFloat(a) / 100 : Number(a);
  return { r: Number(r), g: Number(g), b: Number(b), a: alpha };
}

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio, order-independent, in `[1, 21]`. */
export function wcagRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over compositing of `top` onto an opaque `bottom`, in sRGB as browsers paint it. */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

/** Chromium's computed serialisation, so harness output can be compared to `getComputedStyle`. */
export function formatCssColor(c: Rgb | Rgba): string {
  const [r, g, b] = [c.r, c.g, c.b].map(Math.round);
  const a = 'a' in c ? c.a : 1;
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/support/color.spec.ts`
Expected: `4 passed`.

If `4.01` misses at 2 dp, don't loosen the assertion. Recompute by hand; lib/focus.ts's figure is the published one, and the arithmetic in this plan gives 4.006.

- [ ] **Step 5: Commit**

```bash
git add frontend/browser/support/color.ts frontend/browser/support/color.spec.ts
git commit -m "test(browser): add WCAG colour maths for the harness"
```

---

### Task 3: Pixel, contrast and CSS helpers, proven on synthetic pages

**Files:**
- Create: `frontend/browser/support/pixels.ts`, `frontend/browser/support/contrast.ts`, `frontend/browser/support/css.ts`
- Test: `frontend/browser/harness-self-test.spec.ts`

**Interfaces:**
- Consumes: `color.ts` (Task 2).
- Produces:
  - `backdropBehindGlyphs(target: Locator): Promise<Rgb>`
  - `medianPixel(png: PNG): Rgb`
  - `interface ContrastMeasurement { ratio: number; text: Rgb; backdrop: Rgb }`
  - `measureContrast(target: Locator): Promise<ContrastMeasurement>`
  - `expectContrast(target: Locator, opts: { atLeast: number; site: string; soft?: boolean }): Promise<ContrastMeasurement>`
  - `AA_SMALL_TEXT = 4.5` and `AA_NON_TEXT = 3`
  - `TAILWIND_DEFAULT_RING = 'rgba(59, 130, 246, 0.5)'`
  - `interface FocusState { label: string; focusVisible: boolean; ringColor: string; boxShadow: string }`
  - `focusByKeyboard(page: Page, target: Locator, maxTabs?: number): Promise<void>`
  - `focusState(target: Locator): Promise<FocusState>`
  - `tabThroughPage(page: Page, maxTabs?: number): Promise<FocusState[]>`
  - `hasRule(page: Page, selectorText: string): Promise<boolean>`

- [ ] **Step 1: Write the failing self-test `frontend/browser/harness-self-test.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

import { formatCssColor } from './support/color';
import { measureContrast } from './support/contrast';
import { focusByKeyboard, focusState, hasRule } from './support/css';
import { backdropBehindGlyphs } from './support/pixels';

/**
 * The harness's own tests. Each case is a page whose answer is known by construction, so a
 * helper that reads the wrong pixel, or measures the wrong node, fails here rather than
 * quietly passing a real page.
 */
test.describe('harness self-test', () => {
  test('reads the backdrop, not the glyphs', async ({ page }) => {
    await page.setContent(
      '<div style="background:#1b1b1e;padding:8px"><span id="t" style="color:#fff;font:700 40px sans-serif">MMMM</span></div>',
    );
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(27, 27, 30)');
  });

  test("keeps an element's own background painted (CLAUDE.md trap 1)", async ({ page }) => {
    // `visibility: hidden` would erase this fill with the text and read the white page instead.
    await page.setContent(
      '<body style="background:#fff"><span id="t" style="background:#e10600;color:#fff;font:700 40px sans-serif">MM</span></body>',
    );
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(225, 6, 0)');
  });

  test('sees a translucent layer painted by a sibling, which getComputedStyle cannot', async ({ page }) => {
    await page.setContent(`
      <div style="background:#09090b;padding:8px">
        <div style="position:relative">
          <div style="position:absolute;inset:0;background:rgb(39 39 42 / 0.6)"></div>
          <span id="t" style="position:relative;color:#a1a1aa;font:700 40px sans-serif">MM</span>
        </div>
      </div>`);
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(27, 27, 30)');
  });

  test('refuses a screen-reader-only copy (CLAUDE.md trap 2, TextAnimate)', async ({ page }) => {
    await page.setContent(
      '<span id="t" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">P1</span>',
    );
    await expect(backdropBehindGlyphs(page.locator('#t'))).rejects.toThrow(/screen-reader-only/);
  });

  test('restores the glyphs after measuring', async ({ page }) => {
    await page.setContent('<span id="t" style="color:#fff;background:#000;font:40px sans-serif">MM</span>');
    await backdropBehindGlyphs(page.locator('#t'));
    expect(await page.locator('#t').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  });

  test('measures a known ratio end to end', async ({ page }) => {
    await page.setContent('<span id="t" style="color:#fff;background:#767676;font:40px sans-serif">MM</span>');
    expect((await measureContrast(page.locator('#t'))).ratio).toBeCloseTo(4.54, 2);
  });

  test('refuses to measure mid-fade', async ({ page }) => {
    await page.setContent('<div style="opacity:.5"><span id="t" style="color:#fff;background:#000;font:40px sans-serif">MM</span></div>');
    await expect(measureContrast(page.locator('#t'))).rejects.toThrow(/opacity/);
  });

  test('reads a keyboard focus ring and a generated rule', async ({ page }) => {
    await page.setContent(`
      <style>.ring:focus-visible { outline: none; box-shadow: 0 0 0 2px rgb(225, 6, 0); --tw-ring-color: rgb(225 6 0 / 1); }</style>
      <a href="#a">first</a><a id="t" class="ring" href="#b">target</a>`);
    const target = page.locator('#t');
    await focusByKeyboard(page, target);
    const state = await focusState(target);
    expect(state.focusVisible).toBe(true);
    expect(state.ringColor).toBe('rgb(225, 6, 0)');
    expect(await hasRule(page, '.ring:focus-visible')).toBe(true);
    expect(await hasRule(page, '.absent:focus-visible')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/harness-self-test.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `frontend/browser/support/pixels.ts`**

```ts
import type { Locator } from '@playwright/test';
import { PNG } from 'pngjs';

import type { Rgb } from './color';

/**
 * CLAUDE.md's pixel method, ported off macOS: hide only the glyphs, screenshot, read what is
 * behind them. A Buffer decoded by pngjs; no `sips`, no BMP, no temp file.
 *
 * Two traps are designed out rather than remembered:
 *
 * 1. **An element's own background must survive.** `visibility: hidden` hides a monogram tile's
 *    fill along with its text, so the reading is the page. This makes the glyphs *transparent*
 *    instead (`color`, `-webkit-text-fill-color`, `text-shadow`), which leaves backgrounds,
 *    borders and siblings painted.
 * 2. **`TextAnimate` renders an `sr-only` copy beside the painted `aria-hidden` spans.** Measuring
 *    the accessible copy reports 1:1. The copy is a 1px clipped box, so it is refused outright.
 *
 * Anything drawn in `currentColor` (an inline SVG icon, a `border-current`) goes transparent
 * too. That is intended: it is glyph-like, and it is not the backdrop.
 */

const HIDE_ATTR = 'data-harness-hide-glyphs';
const HIDE_STYLE_ID = 'harness-hide-glyphs';

async function assertPaintedGlyphs(target: Locator): Promise<void> {
  const info = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      clipped: style.position === 'absolute' && style.clip !== 'auto',
      text: (el.textContent ?? '').trim(),
    };
  });
  if (info.width <= 1 || info.height <= 1 || info.clipped) {
    throw new Error(
      `backdropBehindGlyphs: "${info.text}" is a screen-reader-only copy (${info.width}x${info.height}); ` +
        'measure the painted aria-hidden glyphs instead',
    );
  }
  if (info.text === '') throw new Error('backdropBehindGlyphs: target has no text to hide');
}

/** Per-channel median over the whole image: robust to leftover anti-aliasing and gradient edges. */
export function medianPixel(png: PNG): Rgb {
  const count = png.width * png.height;
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < count; i++) {
    channels[0].push(png.data[i * 4] ?? 0);
    channels[1].push(png.data[i * 4 + 1] ?? 0);
    channels[2].push(png.data[i * 4 + 2] ?? 0);
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  return { r: median(channels[0]), g: median(channels[1]), b: median(channels[2]) };
}

export async function backdropBehindGlyphs(target: Locator): Promise<Rgb> {
  await assertPaintedGlyphs(target);
  await target.evaluate(
    (el, [attr, styleId]) => {
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent =
          `[${attr}], [${attr}] * { color: transparent !important; ` +
          '-webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
        document.head.appendChild(style);
      }
      el.setAttribute(attr, '');
    },
    [HIDE_ATTR, HIDE_STYLE_ID] as const,
  );
  try {
    // Two frames: one to restyle, one to paint.
    await target.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const buffer = await target.screenshot({ animations: 'disabled', caret: 'hide' });
    return medianPixel(PNG.sync.read(buffer));
  } finally {
    await target.evaluate((el, attr) => el.removeAttribute(attr), HIDE_ATTR);
  }
}
```

- [ ] **Step 4: Implement `frontend/browser/support/contrast.ts`**

```ts
import { expect, type Locator } from '@playwright/test';

import { composite, formatCssColor, parseCssColor, wcagRatio, type Rgb } from './color';
import { backdropBehindGlyphs } from './pixels';

/** WCAG 1.4.3 AA for text under 18pt / 14pt bold — every team-coloured label on the site. */
export const AA_SMALL_TEXT = 4.5;

/** WCAG 1.4.11 / 2.4.11 non-text bar, e.g. focus indicators. */
export const AA_NON_TEXT = 3;

export interface ContrastMeasurement {
  ratio: number;
  /** The text colour as painted: its computed colour composited over the backdrop. */
  text: Rgb;
  /** What the screenshot shows behind the glyphs. */
  backdrop: Rgb;
}

/**
 * The text colour comes from the painted node's computed style, and the backdrop from pixels.
 * That split is the point: the defect this catches is a helper judging the right colour
 * against the wrong background, so the background has to be what is actually on screen.
 */
export async function measureContrast(target: Locator): Promise<ContrastMeasurement> {
  const backdrop = await backdropBehindGlyphs(target);
  const { color, opacity } = await target.evaluate((el) => {
    let product = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      product *= Number(getComputedStyle(node).opacity);
    }
    return { color: getComputedStyle(el).color, opacity: product };
  });
  if (opacity < 1) {
    throw new Error(`measureContrast: target is painted at opacity ${opacity}; measure after its motion settles`);
  }
  const text = composite(parseCssColor(color), backdrop);
  return { ratio: wcagRatio(text, backdrop), text, backdrop };
}

/**
 * Asserts a WCAG floor and names the site, so the expectation documents intent (which bar, on
 * which surface) and a failure prints everything needed to act on it. No ratio is pinned.
 */
export async function expectContrast(
  target: Locator,
  { atLeast, site, soft = false }: { atLeast: number; site: string; soft?: boolean },
): Promise<ContrastMeasurement> {
  const m = await measureContrast(target);
  const message =
    `${site}: ${m.ratio.toFixed(2)}:1, needs ${atLeast}:1 ` +
    `(text ${formatCssColor(m.text)} on backdrop ${formatCssColor(m.backdrop)})`;
  if (soft) expect.soft(m.ratio, message).toBeGreaterThanOrEqual(atLeast);
  else expect(m.ratio, message).toBeGreaterThanOrEqual(atLeast);
  return m;
}
```

- [ ] **Step 5: Implement `frontend/browser/support/css.ts`**

```ts
import type { Locator, Page } from '@playwright/test';

import { formatCssColor, parseCssColor } from './color';

/**
 * Tailwind preflight's `--tw-ring-color`, as Chromium serialises it inside a computed
 * `box-shadow`. CLAUDE.md measured exactly this on every control whose ring-colour rule was
 * never generated. It is on every element at rest, so it only means something inside a
 * *painted* shadow.
 */
export const TAILWIND_DEFAULT_RING = 'rgba(59, 130, 246, 0.5)';

export interface FocusState {
  label: string;
  focusVisible: boolean;
  /** `--tw-ring-color`, normalised to Chromium's computed form. */
  ringColor: string;
  boxShadow: string;
}

/**
 * Moves focus to `target` with real Tab presses, so `:focus-visible` matches for the reason it
 * does for a user. Call it straight after `goto`: Chromium resumes sequential navigation from
 * the last focused element, not from the top.
 */
export async function focusByKeyboard(page: Page, target: Locator, maxTabs = 100): Promise<void> {
  const handle = await target.elementHandle();
  if (handle === null) throw new Error('focusByKeyboard: target is not in the DOM');
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    if (await handle.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`focusByKeyboard: ${maxTabs} Tab presses never reached the target`);
}

interface RawFocusState {
  label: string;
  focusVisible: boolean;
  ring: string;
  boxShadow: string;
}

function normalise(raw: RawFocusState): FocusState {
  return {
    label: raw.label,
    focusVisible: raw.focusVisible,
    ringColor: raw.ring === '' ? '' : formatCssColor(parseCssColor(raw.ring)),
    boxShadow: raw.boxShadow,
  };
}

/*
 * The two readers below repeat one small body because Playwright serialises the function into
 * the page — a shared closure cannot cross that boundary.
 */

export async function focusState(target: Locator): Promise<FocusState> {
  const raw = await target.evaluate((el): RawFocusState => {
    const style = getComputedStyle(el);
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"`,
      focusVisible: el.matches(':focus-visible'),
      ring: style.getPropertyValue('--tw-ring-color').trim(),
      boxShadow: style.boxShadow,
    };
  });
  return normalise(raw);
}

async function activeFocusState(page: Page): Promise<FocusState | null> {
  const raw = await page.evaluate((): RawFocusState | null => {
    const el = document.activeElement;
    if (el === null || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"`,
      focusVisible: el.matches(':focus-visible'),
      ring: style.getPropertyValue('--tw-ring-color').trim(),
      boxShadow: style.boxShadow,
    };
  });
  return raw === null ? null : normalise(raw);
}

/**
 * Tabs through the whole page from the top, recording each focused control's ring. Stops when
 * focus leaves the document or wraps back to the first control.
 */
export async function tabThroughPage(page: Page, maxTabs = 250): Promise<FocusState[]> {
  const states: FocusState[] = [];
  let first: string | null = null;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;
      if (!el.hasAttribute('data-harness-tab-id')) el.setAttribute('data-harness-tab-id', String(Math.random()));
      return el.getAttribute('data-harness-tab-id');
    });
    if (id === null || id === first) break;
    first ??= id;
    const state = await activeFocusState(page);
    if (state !== null) states.push(state);
  }
  return states;
}

/** Whether any same-origin stylesheet contains a rule with exactly this selector text. */
export async function hasRule(page: Page, selectorText: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    const walk = (rules: CSSRuleList): boolean =>
      Array.from(rules).some(
        (rule) =>
          (rule instanceof CSSStyleRule && rule.selectorText === wanted) ||
          ('cssRules' in rule && walk((rule as CSSGroupingRule).cssRules)),
      );
    return Array.from(document.styleSheets).some((sheet) => {
      try {
        return walk(sheet.cssRules);
      } catch {
        return false; // cross-origin sheet
      }
    });
  }, selectorText);
}
```

- [ ] **Step 6: Run the self-test and confirm it passes**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/harness-self-test.spec.ts`
Expected: `8 passed`.

If the `#767676` ratio misses, check whether the element box includes any area outside the background. Don't loosen the tolerance.

- [ ] **Step 7: typecheck + lint**

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/browser/support/pixels.ts frontend/browser/support/contrast.ts frontend/browser/support/css.ts frontend/browser/harness-self-test.spec.ts
git commit -m "test(browser): port the hide-the-glyphs pixel method to pngjs, with its traps self-tested"
```

---

### Task 4: API mocks and the shared test fixture

**Files:**
- Create: `frontend/browser/support/api-mocks.ts`, `frontend/browser/support/test.ts`
- Modify: `frontend/browser/harness-smoke.spec.ts` (import from `./support/test`, and add a `/standings` case)

**Interfaces:**
- Produces:
  - `mockApi(page: Page): Promise<string[]>`, where the array collects the URLs of unmocked `/api/` calls
  - `test` and `expect` from `browser/support/test.ts`
  - Every spec after this task imports `test`/`expect` from `./support/test`, except `support/color.spec.ts` and `harness-self-test.spec.ts`, which need no server data.

- [ ] **Step 1: Write the failing smoke case**

Append to `frontend/browser/harness-smoke.spec.ts`, and change its import to `import { expect, test } from './support/test';`:

```ts
test('/standings renders from the mocked API, with no backend running', async ({ page }) => {
  await page.goto('/standings');
  await expect(page.getByRole('table').first()).toBeVisible();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/harness-smoke.spec.ts`
Expected: FAIL. Either the module is missing, or the table never renders because `:8000` is not listening.

- [ ] **Step 3: Implement `frontend/browser/support/api-mocks.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

/**
 * Serves `/api/*` from the captured responses in `tests/fixtures/`, the same bytes the Vitest
 * suite parses, so the browser suite needs no backend and no network.
 *
 * Fails closed: an `/api/` request with no fixture gets a 501 and is recorded, and the
 * fixture in `test.ts` fails the test on it. A new endpoint therefore cannot go silently
 * unmocked.
 */
const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

export async function mockApi(page: Page): Promise<string[]> {
  const unmocked: string[] = [];
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (/^\/api\/races\/\d{4}$/.test(pathname)) {
      return route.fulfill({ json: fixture('races-2026.json') });
    }
    const standings = /^\/api\/standings\/(\d{4})$/.exec(pathname);
    if (standings) {
      // The page opens on the server clock's year, so any year without its own capture gets
      // the 2026 one rather than failing the day the calendar turns over.
      const named = `standings-${standings[1]}.json`;
      return route.fulfill({
        json: fixture(existsSync(path.join(FIXTURES, named)) ? named : 'standings-2026.json'),
      });
    }
    unmocked.push(route.request().url());
    return route.fulfill({ status: 501, body: 'unmocked in the browser harness' });
  });
  return unmocked;
}
```

- [ ] **Step 4: Implement `frontend/browser/support/test.ts`**

```ts
import { test as base, expect } from '@playwright/test';

import { mockApi } from './api-mocks';

/** `test` with the API mocked on every page, and a failure if any `/api/` call went unmocked. */
export const test = base.extend<{ apiMocks: string[] }>({
  apiMocks: [
    async ({ page }, use) => {
      const unmocked = await mockApi(page);
      await use(unmocked);
      expect(unmocked, 'an /api/ request had no fixture in tests/fixtures').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/harness-smoke.spec.ts`
Expected: `2 passed`.

If `/standings` renders no `table`, read `components/standings/standings-tables.tsx` for the real role and use it. Don't weaken the case to "page loads".

- [ ] **Step 6: Commit**

```bash
git add frontend/browser/support/api-mocks.ts frontend/browser/support/test.ts frontend/browser/harness-smoke.spec.ts
git commit -m "test(browser): serve /api from the captured fixtures, failing closed"
```

---

### Task 5: Class 1 (rules never generated) + the mutation runner + mutants 01 and 02

**Files:**
- Create: `frontend/browser/focus-rings.spec.ts`, `frontend/browser/transition-tokens.spec.ts`, `frontend/scripts/run-mutants.mjs`, `frontend/browser/mutations/mutants.json`, `frontend/browser/mutations/01-tailwind-content-no-lib.patch`, `frontend/browser/mutations/02-duration-arbitrary.patch`, `frontend/browser/mutations/README.md`

**Interfaces:**
- Consumes: `css.ts` (Task 3), `support/test.ts` (Task 4).
- Produces:
  - `mutants.json` entries `{ patch: string; reintroduces: string; specs: string[]; mustFail: string[] }`.
  - `node scripts/run-mutants.mjs [patchPrefix…]`, which exits 0 only if every selected mutant is killed.

- [ ] **Step 1: Write `frontend/browser/focus-rings.spec.ts`**

```ts
import { focusByKeyboard, focusState, hasRule, tabThroughPage, TAILWIND_DEFAULT_RING } from './support/css';
import { expect, test } from './support/test';

/**
 * Class 1: a Tailwind rule that was never generated. `focus-visible:ring-f1-red` and
 * `focus-visible:ring-ink` are written only in `lib/focus.ts`; with `lib/` missing from
 * `content` neither rule exists, the class is still on the element, and every ring falls back
 * to Tailwind's default blue, invisible on the red CTA. Only computed style can see it.
 */

/** `tailwind.config.ts` → `ink`. */
const INK = 'rgb(244, 244, 237)';
/** `tailwind.config.ts` → `f1.red`. */
const F1_RED = 'rgb(225, 6, 0)';

test('the red-filled hero CTA takes the ink ring', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Generate a Briefing', exact: true }).first();
  await focusByKeyboard(page, cta);
  const state = await focusState(cta);
  expect(state.focusVisible).toBe(true);
  expect(
    await hasRule(page, '.focus-visible\\:ring-ink:focus-visible'),
    'no `focus-visible:ring-ink` rule was generated: is lib/ in tailwind.config.ts `content`?',
  ).toBe(true);
  expect(state.ringColor, 'focusRingOnRedFill: ink on an f1-red fill (lib/focus.ts rule 2)').toBe(INK);
});

test('a flush control on base takes the red ring', async ({ page }) => {
  await page.goto('/');
  const secondary = page.getByRole('link', { name: 'Explore Car Anatomy', exact: true }).first();
  await focusByKeyboard(page, secondary);
  const state = await focusState(secondary);
  expect(state.focusVisible).toBe(true);
  expect(
    await hasRule(page, '.focus-visible\\:ring-f1-red:focus-visible'),
    'no `focus-visible:ring-f1-red` rule was generated: is lib/ in tailwind.config.ts `content`?',
  ).toBe(true);
  expect(state.ringColor, 'focusRingOffsetBase (lib/focus.ts rule 1)').toBe(F1_RED);
});

for (const route of ['/', '/teams', '/tyres', '/candy']) {
  test(`no focusable control on ${route} paints Tailwind's default blue ring`, async ({ page }) => {
    await page.goto(route);
    const states = await tabThroughPage(page);
    expect(states.length, 'Tab reached no controls at all').toBeGreaterThan(0);
    const blue = states.filter((s) => s.boxShadow.includes(TAILWIND_DEFAULT_RING)).map((s) => s.label);
    expect(blue, `controls on ${route} whose ring colour rule was never generated`).toEqual([]);
  });
}
```

- [ ] **Step 2: Write `frontend/browser/transition-tokens.spec.ts`**

```ts
import { expect, test } from './support/test';

/**
 * Class 1 again: `duration-[600ms]` generated no rule here, so the landing crossfade silently
 * ran at the 150ms `transition-[background-color]` sets for itself. The fix is the real token
 * `duration-600` (tailwind.config.ts). The class string reads correctly either way; only the
 * computed duration differs.
 */
test.use({ reducedMotion: 'no-preference' }); // the transition class is dropped under `reduce`

test('the warm landing sections crossfade over 600ms, not the 150ms fallback', async ({ page }) => {
  await page.goto('/');
  const warm = page.locator('[data-landing-tone="base-warm"]');
  await expect(warm.first()).toBeAttached();
  const durations = await warm.evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) {
    expect(d, 'TONE_TRANSITION in landing-section-theme.tsx (TONE_TRANSITION_MS = 600)').toBe('0.6s');
  }
});
```

- [ ] **Step 3: Run both specs on the green tree**

Run: `cd frontend && mise exec -- pnpm build && mise exec -- pnpm exec playwright test browser/focus-rings.spec.ts browser/transition-tokens.spec.ts`
Expected: `7 passed`.

If a route's sweep reports a blue ring on the green tree, that is a **real, currently-shipped defect**. Stop, record the label, and report it to the user. Do not exclude it.

- [ ] **Step 4: Generate mutant 01**

In `frontend/tailwind.config.ts`, delete the line `    './lib/**/*.{js,ts}',` from `content`. Then:

```bash
git diff -- frontend/tailwind.config.ts > frontend/browser/mutations/01-tailwind-content-no-lib.patch
git checkout -- frontend/tailwind.config.ts
```

- [ ] **Step 5: Generate mutant 02**

In `frontend/components/landing/landing-section-theme.tsx`, change `const TONE_TRANSITION = 'transition-[background-color] duration-600';` to `const TONE_TRANSITION = 'transition-[background-color] duration-[600ms]';`. Then:

```bash
git diff -- frontend/components/landing/landing-section-theme.tsx > frontend/browser/mutations/02-duration-arbitrary.patch
git checkout -- frontend/components/landing/landing-section-theme.tsx
```

- [ ] **Step 6: Write `frontend/browser/mutations/mutants.json`**

```json
[
  {
    "patch": "01-tailwind-content-no-lib.patch",
    "reintroduces": "lib/ missing from tailwind content, so focus-visible:ring-f1-red and ring-ink are never generated (CLAUDE.md: 'A Tailwind class that no content glob reaches')",
    "specs": ["browser/focus-rings.spec.ts"],
    "mustFail": ["the red-filled hero CTA takes the ink ring", "a flush control on base takes the red ring"]
  },
  {
    "patch": "02-duration-arbitrary.patch",
    "reintroduces": "duration-[600ms] instead of the duration-600 token, so the crossfade runs at 150ms (CLAUDE.md, same section)",
    "specs": ["browser/transition-tokens.spec.ts"],
    "mustFail": ["the warm landing sections crossfade over 600ms, not the 150ms fallback"]
  }
]
```

- [ ] **Step 7: Write `frontend/scripts/run-mutants.mjs`**

```js
#!/usr/bin/env node
/**
 * Proves the browser harness still catches the defects it exists for.
 *
 * For each entry in browser/mutations/mutants.json: apply the patch, rebuild, run the named
 * specs, and require every title in `mustFail` to fail. Then reverse the patch. A mutant is
 * "killed" only if *those tests* failed. A red run caused by something else (the server did
 * not start, an unrelated spec) does not count, because that is a fake kill.
 *
 *   node scripts/run-mutants.mjs            # every mutant
 *   node scripts/run-mutants.mjs 03 05      # by patch-name prefix
 *
 * Exit 0 only if every selected mutant was killed. Outcomes other than `killed`:
 *   survived     the harness passed with the defect in place: coverage is gone
 *   stale        the patch no longer applies: regenerate it (browser/mutations/README.md)
 *   build-failed the mutant does not compile: the patch needs adapting, not deleting
 *
 * Outside CI it rebuilds the clean tree at the end, so the next `pnpm test:browser` does not
 * run against the last mutant's bundle.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: frontend, encoding: 'utf8' }).trim();
const mutationsDir = path.join(frontend, 'browser', 'mutations');
const all = JSON.parse(readFileSync(path.join(mutationsDir, 'mutants.json'), 'utf8'));

const prefixes = process.argv.slice(2);
const selected = prefixes.length ? all.filter((m) => prefixes.some((p) => m.patch.startsWith(p))) : all;
if (selected.length === 0) {
  console.error(`run-mutants: no mutant matches ${prefixes.join(', ')}`);
  process.exit(2);
}

const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { cwd: frontend, stdio: 'inherit', env: { ...process.env, ...env } }).status;

if (git(['status', '--porcelain']).trim() !== '') {
  console.error('run-mutants: the working tree is dirty; commit or set work aside first.');
  process.exit(2);
}

/** Titles of failed tests in a Playwright JSON report. */
function failedTitles(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const failed = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) if (!spec.ok) failed.push(spec.title);
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return failed;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'run-mutants-'));
const results = [];

for (const mutant of selected) {
  const patch = path.join(mutationsDir, mutant.patch);
  console.log(`\n=== ${mutant.patch}\n    ${mutant.reintroduces}\n`);
  try {
    git(['apply', '--check', patch]);
  } catch {
    results.push({ patch: mutant.patch, outcome: 'stale', detail: 'git apply --check failed' });
    continue;
  }
  git(['apply', patch]);
  try {
    if (run('pnpm', ['build']) !== 0) {
      results.push({ patch: mutant.patch, outcome: 'build-failed', detail: '' });
      continue;
    }
    const reportPath = path.join(scratch, `${mutant.patch}.json`);
    run('pnpm', ['exec', 'playwright', 'test', ...mutant.specs, '--retries=0', '--reporter=line,json'], {
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
    });
    const failed = failedTitles(reportPath);
    const missing = mutant.mustFail.filter((title) => !failed.includes(title));
    results.push({
      patch: mutant.patch,
      outcome: missing.length === 0 ? 'killed' : 'survived',
      detail: missing.length === 0 ? `failed: ${failed.length}` : `still passing: ${missing.join(' | ')}`,
    });
  } finally {
    git(['apply', '-R', patch]);
  }
}

console.log('\n');
console.table(results);

if (!process.env.CI) {
  console.log('Rebuilding the unmutated tree so .next matches the source again.');
  run('pnpm', ['build']);
}

process.exit(results.every((r) => r.outcome === 'killed') ? 0 : 1);
```

- [ ] **Step 8: Write `frontend/browser/mutations/README.md`**

````markdown
# Mutants

Each patch puts back one defect CLAUDE.md records as having shipped green. `mutants.json` pairs
it with the tests that must fail. `pnpm test:browser:mutants` proves that they still do.

A mutant that **survives** means the harness has stopped covering that class. Fix the spec, not
the manifest.

A **stale** patch means the code it edits has moved. Regenerate it; never delete it:

```bash
# from the repo root, on a clean tree
$EDITOR frontend/<the file named in the patch>     # reintroduce the defect by hand
git diff -- frontend/<file> > frontend/browser/mutations/<same name>.patch
git checkout -- frontend/<file>
cd frontend && pnpm test:browser:mutants <prefix>
```
````

- [ ] **Step 9: Commit (so the runner's clean-tree check passes)**

```bash
git add frontend/browser/focus-rings.spec.ts frontend/browser/transition-tokens.spec.ts frontend/scripts/run-mutants.mjs frontend/browser/mutations
git commit -m "test(browser): catch ungenerated ring and duration rules, with mutants proving it"
```

- [ ] **Step 10: Kill mutants 01 and 02**

Run: `cd frontend && mise exec -- pnpm test:browser:mutants 01 02`
Expected: the table shows `killed` for both, and the process exits 0.

- If 01 is `killed` but the `/`, `/teams`, `/tyres` or `/candy` sweep did **not** also fail under it, note it, because the sweep is not covering what it claims. (Read the line output: `focus-rings.spec.ts` should show 6 failures under mutant 01.)
- If 02 `survived`, CLAUDE.md's claim that `duration-[600ms]` generates no rule has stopped being true on this Tailwind version. Don't fake it. Report to the user that class-1 coverage rests on mutant 01 alone, drop 02 from `mutants.json`, and record why in the README.
- Paste the final table into `frontend/browser/mutations/RESULTS.md` under a `## 01, 02` heading, with the date and commit.

- [ ] **Step 11: Commit the result record**

```bash
git add frontend/browser/mutations/RESULTS.md
git commit -m "test(browser): record mutants 01-02 killed"
```

---

### Task 6: Class 2 (contrast against the real backdrop) + mutant 03

**Files:**
- Create: `frontend/browser/team-contrast.spec.ts`, `frontend/browser/mutations/03-rail-readable-on-dark.patch`
- Modify: `frontend/browser/mutations/mutants.json`, `frontend/browser/mutations/RESULTS.md`

**Interfaces:**
- Consumes: `expectContrast`, `AA_SMALL_TEXT` (Task 3); `test` (Task 4).

- [ ] **Step 1: Write `frontend/browser/team-contrast.spec.ts`**

```ts
import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { expect, test } from './support/test';

/**
 * Class 2: team colour judged against the wrong backdrop. `readableOnDark` is correct only on
 * bare zinc-950, with zero headroom, so every translucent layer between glyph and page needs
 * its own helper. The unit tests reproduced the mistake twice, because they measured the right
 * colour against the wrong background. Here the backdrop is read from pixels, and axe cannot
 * judge these sites at all ("background could not be determined").
 *
 * Every team is measured, not a sample: a helper can clear AA for ten liveries and miss one.
 */

test.describe('laptop width: rail + section standing', () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test('every team, active in the rail and in its section, clears AA', async ({ page }) => {
    await page.goto('/teams');
    const rail = page.getByRole('navigation', { name: 'Constructors' });
    const rows = rail.getByRole('link');
    await expect(rows).toHaveCount(11);

    for (let i = 0; i < 11; i++) {
      const row = rows.nth(i);
      const href = await row.getAttribute('href');
      const name = (await row.locator('span.font-medium').textContent())?.trim() ?? `row ${i}`;
      await row.click();
      await expect(row).toHaveAttribute('aria-current', 'location');

      await expectContrast(row.locator('span.font-mono'), {
        atLeast: AA_SMALL_TEXT,
        site: `rail active row (railStandingColor over bg-zinc-800/60), ${name}`,
        soft: true,
      });
      await expectContrast(page.locator(`${href} [data-testid="section-standing"]`), {
        atLeast: AA_SMALL_TEXT,
        site: `section standing line (sectionStandingColor inside the glow), ${name}`,
        soft: true,
      });
    }
  });
});

test.describe('desktop width: compare tray', () => {
  test('every leading tray value clears AA', async ({ page }) => {
    await page.goto('/teams');
    const toggles = page.getByRole('button', { name: /^Compare / });
    await expect(toggles).toHaveCount(11);

    // Pairs (0,1) (2,3) … (10,0): every team appears in at least one comparison.
    for (let i = 0; i < 11; i += 2) {
      const a = toggles.nth(i);
      const b = toggles.nth((i + 1) % 11);
      const pair = `${await a.getAttribute('aria-label')} vs ${await b.getAttribute('aria-label')}`;
      await a.click();
      await b.click();
      const leaders = page.locator('[data-testid^="compare-value-"][style*="color"]');
      await expect(leaders.first()).toBeVisible();
      for (const cell of await leaders.all()) {
        await expectContrast(cell, {
          atLeast: AA_SMALL_TEXT,
          site: `compare tray leader (trayValueColor over bg-zinc-900/60), ${pair}`,
          soft: true,
        });
      }
      await page.getByRole('button', { name: 'Clear comparison' }).click();
    }
  });
});
```

- [ ] **Step 2: Run it on the green tree**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/team-contrast.spec.ts`
Expected: `2 passed`.

- If a selector doesn't resolve, read the component (`teams-nav-rail.tsx`, `team-section.tsx`, `teams-compare-tray.tsx`, `teams-comparison-grid.tsx`) and fix the selector. Every selector above was read from them at `b0e0926`.
- If a site genuinely measures under 4.5 on the green tree, that is a shipped defect. Report it to the user with the printed message, and do not lower the floor.

- [ ] **Step 3: Generate mutant 03**

In `frontend/components/teams/teams-nav-rail.tsx`:
- change the import `import { railStandingColor } from '@/lib/team-utils';` to `import { readableOnDark } from '@/lib/team-utils';`
- change `railStandingColor(team.color)` to `readableOnDark(team.color)`

Then:

```bash
git diff -- frontend/components/teams/teams-nav-rail.tsx > frontend/browser/mutations/03-rail-readable-on-dark.patch
git checkout -- frontend/components/teams/teams-nav-rail.tsx
```

- [ ] **Step 4: Add it to `mutants.json`**

```json
  {
    "patch": "03-rail-readable-on-dark.patch",
    "reintroduces": "the rail's active standing coloured with readableOnDark, judged against bare zinc-950 while it sits on bg-zinc-800/60 (CLAUDE.md: measured 4.02:1)",
    "specs": ["browser/team-contrast.spec.ts"],
    "mustFail": ["every team, active in the rail and in its section, clears AA"]
  }
```

- [ ] **Step 5: Commit, then kill it**

```bash
git add frontend/browser/team-contrast.spec.ts frontend/browser/mutations
git commit -m "test(browser): judge team-coloured text against the pixels behind it"
cd frontend && mise exec -- pnpm test:browser:mutants 03
```

Expected: `killed`. The line output names at least Ferrari's rail row under 4.5, per CLAUDE.md's 4.02:1. Paste the table and the failing messages into `RESULTS.md` under `## 03`.

- [ ] **Step 6: Commit the result**

```bash
git add frontend/browser/mutations/RESULTS.md
git commit -m "test(browser): record mutant 03 killed"
```

---

### Task 7: Class 3 (invisible text) + axe smoke + mutant 04

**Files:**
- Create: `frontend/browser/support/invisible-text.ts`, `frontend/browser/invisible-text.spec.ts`, `frontend/browser/a11y-smoke.spec.ts`, `frontend/browser/mutations/04-sm-text-base.patch`
- Modify: `frontend/browser/mutations/mutants.json`, `frontend/browser/mutations/RESULTS.md`

**Interfaces:**
- Consumes: `color.ts` (Task 2), `test` (Task 4).
- Produces:
  - `INVISIBLE_BELOW = 1.5`
  - `interface InvisibleText { text: string; path: string; color: string; backdrop: string; ratio: number }`
  - `findInvisibleText(page: Page): Promise<InvisibleText[]>`

- [ ] **Step 1: Implement `frontend/browser/support/invisible-text.ts`**

```ts
import type { Page } from '@playwright/test';

import { composite, parseCssColor, wcagRatio } from './color';

/**
 * Below this, text is not "low contrast": it is not there. `sm:text-base` resolves to the
 * `base` colour token (#09090B) and paints text at 1.00:1 on the #09090B page. It reads like
 * text that failed to render, and the class string reads correctly.
 *
 * Deliberately far below AA: this sweep is a net for *invisible* text across whole routes, not
 * a contrast audit (axe and `expectContrast` do that). A high floor would drown it in the
 * approximation below.
 */
export const INVISIBLE_BELOW = 1.5;

export interface InvisibleText {
  text: string;
  path: string;
  color: string;
  backdrop: string;
  ratio: number;
}

interface Sample {
  text: string;
  path: string;
  color: string;
  backdrop: string;
}

/**
 * Scrolls the page top to bottom one viewport at a time and, at each stop, records every
 * visible element in the viewport that owns a text node. The backdrop is its nearest *opaque*
 * ancestor background (translucent layers skipped). An element under a `background-image` is
 * skipped, because its backdrop is unknowable from computed style.
 *
 * Sampling per stop, rather than once after a scroll-through, is what catches text inside
 * `BlurFade inView`, which is at opacity 0 whenever it is off screen.
 */
export async function findInvisibleText(page: Page): Promise<InvisibleText[]> {
  const samples = await page.evaluate(async (): Promise<Sample[]> => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const isOpaque = (c: string) => c.startsWith('rgb(');
    const seen = new Map<string, Sample>();

    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const index = n.parentElement ? Array.from(n.parentElement.children).indexOf(n) + 1 : 1;
        parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${index})`);
      }
      return parts.join(' > ');
    };

    const backdropOf = (el: Element): string | null => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        if (style.backgroundImage !== 'none') return null;
        if (isOpaque(style.backgroundColor)) return style.backgroundColor;
      }
      return 'rgb(255, 255, 255)'; // the canvas default
    };

    const sampleViewport = () => {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const ownsText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        if (!ownsText) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue; // sr-only copies
        if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const color = getComputedStyle(el).color;
        if (color.endsWith(', 0)')) continue; // transparent text, e.g. bg-clip-text
        const backdrop = backdropOf(el);
        if (backdrop === null) continue;
        const path = pathOf(el);
        if (!seen.has(path)) {
          seen.set(path, { text: (el.textContent ?? '').trim().slice(0, 60), path, color, backdrop });
        }
      }
    };

    const step = Math.max(200, Math.round(innerHeight * 0.8));
    for (let y = 0; ; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await frame();
      await frame();
      sampleViewport();
      if (y + innerHeight >= document.documentElement.scrollHeight) break;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return Array.from(seen.values());
  });

  return samples
    .map((s) => {
      const backdrop = parseCssColor(s.backdrop);
      const ratio = wcagRatio(composite(parseCssColor(s.color), backdrop), backdrop);
      return { ...s, ratio };
    })
    .filter((s) => s.ratio < INVISIBLE_BELOW);
}
```

- [ ] **Step 2: Write `frontend/browser/invisible-text.spec.ts`**

```ts
import { findInvisibleText } from './support/invisible-text';
import { expect, test } from './support/test';

/**
 * Class 3: text painted in its own backdrop colour. `/teams` runs at 390 as well because the
 * collision is breakpoint-scoped: `sm:text-base` is harmless below 640px and invisible above.
 */
const ROUTES = [
  { path: '/', width: 1440 },
  { path: '/teams', width: 390 },
  { path: '/teams', width: 1440 },
  { path: '/tyres', width: 1440 },
  { path: '/candy', width: 1440 },
  { path: '/standings', width: 1440 },
] as const;

for (const { path, width } of ROUTES) {
  test(`${path} at ${width}px paints no text in its own backdrop colour`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    if (path === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    const invisible = await findInvisibleText(page);
    expect(
      invisible.map((t) => `"${t.text}" ${t.color} on ${t.backdrop} (${t.ratio.toFixed(2)}:1) at ${t.path}`),
      'text that is present in the DOM but not on the screen',
    ).toEqual([]);
  });
}
```

- [ ] **Step 3: Write `frontend/browser/a11y-smoke.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Known axe findings on `main` that are not this harness's to fix, each with its reason.
 * Keyed by route, value is axe rule ids. Empty is the goal; every entry is a debt with an owner.
 */
const KNOWN: Record<string, string[]> = {};

for (const route of ['/', '/teams', '/tyres', '/candy', '/standings']) {
  test(`${route} has no WCAG A/AA axe violations`, async ({ page }) => {
    await page.goto(route);
    if (route === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    const unexpected = violations.filter((v) => !(KNOWN[route] ?? []).includes(v.id));
    expect(
      unexpected.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}
```

- [ ] **Step 4: Run both on the green tree**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/invisible-text.spec.ts browser/a11y-smoke.spec.ts`
Expected: `11 passed`.

Triage every finding on the green tree before going further:
- **invisible-text hit that is a real defect:** stop and report it to the user.
- **invisible-text hit that is a false positive** (dark text over a sibling photo or fill, which the ancestor walk cannot see): add a named skip to `findInvisibleText`, e.g. a `data-harness-backdrop="image"` attribute check. That means adding the attribute to the component, with a comment saying why. Never skip by path.
- **axe violation:** add it to `KNOWN` with a one-line reason comment, and list it in the final report to the user.

- [ ] **Step 5: Generate mutant 04**

In `frontend/components/teams/team-section.tsx`, change the tagline's `className="max-w-sm text-base leading-relaxed text-zinc-300"` to `className="max-w-sm sm:text-base leading-relaxed text-zinc-300"`. This is CLAUDE.md's exact example: a breakpoint-scoped `text-base` on `/teams` body copy.

```bash
git diff -- frontend/components/teams/team-section.tsx > frontend/browser/mutations/04-sm-text-base.patch
git checkout -- frontend/components/teams/team-section.tsx
```

- [ ] **Step 6: Add it to `mutants.json`**

```json
  {
    "patch": "04-sm-text-base.patch",
    "reintroduces": "sm:text-base on /teams body copy: the base colour token #09090B beats text-zinc-300 at >=640px (CLAUDE.md: 'text-base is a colour in this theme')",
    "specs": ["browser/invisible-text.spec.ts"],
    "mustFail": ["/teams at 1440px paints no text in its own backdrop colour"]
  }
```

- [ ] **Step 7: Commit, then kill it**

```bash
git add frontend/browser/support/invisible-text.ts frontend/browser/invisible-text.spec.ts frontend/browser/a11y-smoke.spec.ts frontend/browser/mutations
git commit -m "test(browser): sweep for text painted in its own backdrop colour, plus axe smoke"
cd frontend && mise exec -- pnpm test:browser:mutants 04
```

Expected: `killed`. The 390px case must still **pass** under the mutant, which proves the sweep is breakpoint-true. Check the line output and record both facts in `RESULTS.md` under `## 04`.

If the tagline is skipped because an ancestor carries a `background-image`, the mutant survives. In that case, give the sweep a narrower rule for that one ancestor (a `data-harness-backdrop` attribute naming the solid colour behind the image), re-run, and document it.

- [ ] **Step 8: Commit the result**

```bash
git add frontend/browser/mutations/RESULTS.md
git commit -m "test(browser): record mutant 04 killed"
```

---

### Task 8: Class 4 (scroll spy against real layout) + mutant 05

**Files:**
- Create: `frontend/browser/scroll-spy.spec.ts`, `frontend/browser/mutations/05-scroll-spy-intersection-observer.patch`
- Modify: `frontend/browser/mutations/mutants.json`, `frontend/browser/mutations/RESULTS.md`

- [ ] **Step 1: Write `frontend/browser/scroll-spy.spec.ts`**

```ts
import { expect, test } from './support/test';

/**
 * Class 4: the IntersectionObserver scroll spy named the wrong section at 8 of 31 sampled
 * positions, because `intersectionRatio` is a fraction of the target (a ~560px section against a
 * 270px band peaks at 0.48, so the 0.5 threshold never fires). A fake observer fed its own
 * numbers proves nothing. Here the layout is real and the expected winner is computed from live
 * rects using the documented rule.
 *
 * The band is **copied** from hooks/use-scroll-spy.ts, not imported. An import would let a
 * mutant that drops the export fail at compile time, a fake kill that says nothing about
 * whether the spy tracks scroll.
 */
const BAND_TOP = 0.08;
const BAND_BOTTOM = 0.38;
const SAMPLES = 31;
/** Pixels per frame while walking between samples: a real, continuous scroll, not a teleport. */
const STEP_PX = 40;

test.use({ viewport: { width: 1100, height: 900 } }); // lg: the rail is on screen

test('the rail names the section covering most of the band at every sampled scroll position', async ({ page }) => {
  await page.goto('/teams');
  const rail = page.getByRole('navigation', { name: 'Constructors' });
  const links = rail.getByRole('link');
  await expect(links).toHaveCount(11);
  const ids = await links.evaluateAll((as) => as.map((a) => (a.getAttribute('href') ?? '').replace('#team-', '')));

  const { start, end } = await page.evaluate((sectionIds) => {
    const top = (id: string) => document.getElementById(`team-${id}`)?.getBoundingClientRect().top ?? 0;
    const bottom = (id: string) => document.getElementById(`team-${id}`)?.getBoundingClientRect().bottom ?? 0;
    return {
      start: Math.max(0, top(sectionIds[0] ?? '') + window.scrollY - innerHeight * 0.1),
      end: bottom(sectionIds[sectionIds.length - 1] ?? '') + window.scrollY - innerHeight * 0.4,
    };
  }, ids);

  let expected = ids[0] ?? '';
  let wrong = 0;
  let from = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const to = Math.round(start + ((end - start) * i) / (SAMPLES - 1));
    const winner = await page.evaluate(
      async ({ from, to, sectionIds, bandTop, bandBottom, step }) => {
        const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const dir = to >= from ? 1 : -1;
        for (let y = from; dir * (to - y) > 0; y += dir * Math.min(step, Math.abs(to - y))) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await frame();
        }
        window.scrollTo({ top: to, behavior: 'instant' });
        await frame();
        await frame();
        const top = innerHeight * bandTop;
        const bottom = innerHeight * bandBottom;
        let best: string | null = null;
        let bestCovered = 0;
        for (const id of sectionIds) {
          const rect = document.getElementById(`team-${id}`)?.getBoundingClientRect();
          if (!rect) continue;
          const covered = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
          if (covered > bestCovered) {
            bestCovered = covered;
            best = id;
          }
        }
        return best;
      },
      { from, to, sectionIds: ids, bandTop: BAND_TOP, bandBottom: BAND_BOTTOM, step: STEP_PX },
    );
    from = to;
    // Nothing covering the band keeps the last answer, as the hook does.
    if (winner !== null) expected = winner;

    const active = rail.locator('a[aria-current="location"]');
    try {
      await expect(active).toHaveAttribute('href', `#team-${expected}`, { timeout: 750 });
    } catch {
      wrong++;
      expect
        .soft(await active.getAttribute('href'), `scrollY ${to}: the band is covered most by #team-${expected}`)
        .toBe(`#team-${expected}`);
    }
  }
  expect(wrong, `${wrong} of ${SAMPLES} sampled positions named the wrong section`).toBe(0);
});
```

- [ ] **Step 2: Run it on the green tree**

Run: `cd frontend && mise exec -- pnpm exec playwright test browser/scroll-spy.spec.ts`
Expected: `1 passed`.

If a sample fails on the green tree, first check whether `use-team-navigation.ts`'s `replaceState` or a hash restore moved the scroll. The spec starts with no hash. Do not widen the timeout past 750ms, because the hook answers within a frame.

- [ ] **Step 3: Generate mutant 05**

```bash
git show 4743f45:frontend/hooks/use-scroll-spy.ts > frontend/hooks/use-scroll-spy.ts
cd frontend && mise exec -- pnpm typecheck
```

Expected: typecheck passes, since the signature `useScrollSpy(ids): { activeId; claim }` is unchanged since `4743f45`. If it fails, adapt only the lines needed to compile and keep the observer measurement intact.

```bash
git diff -- frontend/hooks/use-scroll-spy.ts > frontend/browser/mutations/05-scroll-spy-intersection-observer.patch
git checkout -- frontend/hooks/use-scroll-spy.ts
```

- [ ] **Step 4: Add it to `mutants.json`**

```json
  {
    "patch": "05-scroll-spy-intersection-observer.patch",
    "reintroduces": "the IntersectionObserver scroll spy from 4743f45: intersectionRatio peaks at 0.48 against an unreachable 0.5 threshold (CLAUDE.md: wrong at 8 of 31 positions)",
    "specs": ["browser/scroll-spy.spec.ts"],
    "mustFail": ["the rail names the section covering most of the band at every sampled scroll position"]
  }
```

- [ ] **Step 5: Commit, then kill it**

```bash
git add frontend/browser/scroll-spy.spec.ts frontend/browser/mutations
git commit -m "test(browser): check the scroll spy against real layout at 31 positions"
cd frontend && mise exec -- pnpm test:browser:mutants 05
```

Expected: `killed`, with a `N of 31 sampled positions named the wrong section` line. Record N in `RESULTS.md` under `## 05`. CLAUDE.md measured 8.

If it **survives**, class 4 is not covered. Stop and report to the user; do not tune the sampler until it happens to fail. A legitimate fix is making the walk more like real scrolling (a smaller `STEP_PX`). A fix that samples at the specific positions known to break is not legitimate.

- [ ] **Step 6: Commit the result**

```bash
git add frontend/browser/mutations/RESULTS.md
git commit -m "test(browser): record mutant 05 killed"
```

---

### Task 9: CI — the blocking `browser` job and the weekly mutants workflow

**Files:**
- Modify: `.github/workflows/ci.yml`, `Makefile`
- Create: `.github/workflows/browser-mutants.yml`

- [ ] **Step 1: Add the `browser` job to `.github/workflows/ci.yml`**

Append under `jobs:`, after `frontend:`:

```yaml
  browser:
    name: Browser (Playwright against the production build)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      # Versions kept in step with mise.toml and package.json's packageManager field.
      - uses: pnpm/action-setup@v4
        with:
          version: 11.8.0

      - uses: actions/setup-node@v4
        with:
          node-version: "24.17.0"
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # The cache key is the resolved Playwright version, so a bump re-downloads exactly once.
      - name: Resolve Playwright version
        id: playwright
        run: echo "version=$(pnpm exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}-chromium

      - name: Install Chromium and its system libraries
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm exec playwright install --with-deps chromium

      # The browser binary is cached; the apt packages it links against are not.
      - name: Install Chromium's system libraries
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: pnpm exec playwright install-deps chromium

      - name: Build
        run: pnpm build

      # No backend: every /api/ call is served from tests/fixtures by page.route.
      - name: Browser tests
        run: pnpm test:browser

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 14
```

- [ ] **Step 2: Create `.github/workflows/browser-mutants.yml`**

```yaml
name: Browser mutants

# Proves the browser harness still goes red on each defect it exists for. Each mutant rebuilds,
# so this is too slow for every PR; it runs weekly and on demand. A surviving mutant means a
# defect class is no longer covered. See frontend/browser/mutations/README.md.
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:
  # Also on any PR that touches the harness itself — the one change most likely to loosen a spec.
  pull_request:
    paths:
      - "frontend/browser/**"
      - "frontend/scripts/run-mutants.mjs"
      - "frontend/playwright.config.ts"

jobs:
  mutants:
    name: Kill every mutant
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11.8.0

      - uses: actions/setup-node@v4
        with:
          node-version: "24.17.0"
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Resolve Playwright version
        id: playwright
        run: echo "version=$(pnpm exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}-chromium

      - name: Install Chromium and its system libraries
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm exec playwright install --with-deps chromium

      - name: Install Chromium's system libraries
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: pnpm exec playwright install-deps chromium

      - name: Run mutants
        run: pnpm test:browser:mutants
```

- [ ] **Step 3: Add Makefile dispatch targets**

Read the rest of `Makefile` first, so the new targets sit in its `# --- Checks` block with matching help comments. Then:
- add `test-browser test-mutants` to `.PHONY`
- add:

```make
test-browser: $(NODE_STAMP) ## Build, then run the Playwright suite (as CI's browser job)
	cd frontend && $(MISE) pnpm build && $(MISE) pnpm test:browser

test-mutants: $(NODE_STAMP) ## Prove the browser suite still fails on each recorded defect
	cd frontend && $(MISE) pnpm test:browser:mutants
```

If `make ci` lists the CI steps, add `test-browser` to it.

- [ ] **Step 4: Validate the YAML locally**

Run: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); YAML.load_file(".github/workflows/browser-mutants.yml"); puts "ok"'`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/browser-mutants.yml Makefile
git commit -m "ci: gate PRs on the browser suite and run the mutants weekly"
```

---

### Task 10: Docs, full verification, PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add to CLAUDE.md**

Add to the `## Commands` block:

```bash
cd frontend && pnpm build && pnpm test:browser   # Playwright, production build, no backend
cd frontend && pnpm test:browser:mutants         # prove it still fails on each recorded defect
```

Add a new `### Browser tests` subsection under `## Code conventions`, after `### Frontend tests`:

```markdown
### Browser tests

Playwright, in `frontend/browser/`, against `next start` on a **production** build. This is the
gate for everything jsdom cannot see: CSS that was never generated, contrast against the real
composite, text painted in its own backdrop colour, and scroll/layout behaviour. It is a
required CI check (`browser` job). Things that are not guessable:

- **Build first, every time.** The suite never builds, and `reuseExistingServer` is off, so it
  always tests the bundle in `.next`. After `pnpm test:browser:mutants` locally, the runner
  rebuilds the clean tree; if you kill it midway, rebuild before trusting a result.
- **A contrast assertion names a WCAG floor and a site, never a measured ratio:**
  `expectContrast(loc, { atLeast: AA_SMALL_TEXT, site: 'rail active row over bg-zinc-800/60' })`.
  The text colour is computed style; the backdrop is pixels, from `backdropBehindGlyphs`, which
  ports the hide-the-glyphs method to pngjs and designs out both of its traps: glyphs go
  *transparent* rather than `visibility: hidden` (so an element's own fill survives), and a
  1px `sr-only` copy is refused (TextAnimate's accessible twin reads 1:1).
- **There is no screenshot diffing, on purpose.** Every defect here asserts better than it
  diffs, and a golden captured on a broken tree would bless the bug.
- **`/api/` is served from `tests/fixtures/` and fails closed.** A new endpoint with no fixture
  fails the test that reaches it.
- **Mutants prove coverage.** `browser/mutations/` holds one patch per recorded defect and the
  tests it must fail; the weekly `browser-mutants` workflow runs them. A surviving mutant means
  a class is no longer covered: fix the spec. A stale patch means the code moved: regenerate
  it (the README says how), never delete it.
- **The scroll-spy band is copied into the spec, not imported**, so a mutant that removes an
  export cannot be "killed" by a compile error.
```

In the `/tyres` backdrop-helper paragraph, after the sentence ending "`3.95:1` where the glyphs actually sit, at 12px.", add one sentence:

```markdown
(Since the tyres redesign into acts, `compoundTextOnTrackedRow` has no call site; the browser
harness's class-2 mutant uses the teams rail's `railStandingColor` instead.)
```

- [ ] **Step 2: Full local verification**

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test && mise exec -- pnpm build && mise exec -- pnpm test:browser`
Expected: all green. Note the `test:browser` wall time; it must be ≤ 90s for the ≤ 5 min job budget.

Run: `cd frontend && mise exec -- pnpm test:browser:mutants`
Expected: all five `killed`. Replace `RESULTS.md` with this single full run, including the date and commit.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md frontend/browser/mutations/RESULTS.md
git commit -m "docs: document the browser harness and its mutants"
```

- [ ] **Step 4: Push and open the PR**

Remote `lawry98/f1-application` goes via the `git@github-personal:` SSH alias, and `gh` defaults to `lawry98`.

```bash
git push -u origin lc/browser-test-harness-ci-8e286a
gh pr create --base main --title "test: real-browser harness gating CI, proven by mutants" --body-file <(printf '%s\n' "<summary + RESULTS.md table + CI budget + known axe exclusions + any shipped defects found>")
```

- [ ] **Step 5: Watch CI through ccd_pr tools**

Required:
- all three jobs are green
- the `browser` job is ≤ 5 min
- on a re-run, `Cache Playwright browsers` reports a hit, and the job then takes the `install-deps` branch

The `browser-mutants` workflow also runs on this PR (its `pull_request` paths trigger), so confirm all five mutants are killed on Linux there too. `workflow_dispatch` only becomes available once the file is on `main`.
