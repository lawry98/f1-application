import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { mockBriefingStreams, sseFixture } from './support/api-mocks';
import { formatCssColor, wcagRatio, type Rgb } from './support/color';
import { AA_NON_TEXT } from './support/contrast';
import { focusByKeyboard, focusState, hasRule, tabThroughPage, TAILWIND_DEFAULT_RING } from './support/css';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';
import { stopFrameLoops, waitForRealCar, watchThreeScenes } from './support/three';

/**
 * Class 1: a Tailwind rule that was never generated. `focus-visible:ring-ink` is written only in
 * `lib/focus.ts`; with `lib/` missing from `content` that rule does not exist, the class is still
 * on the element, and the ring falls back to Tailwind's default blue, invisible on the red CTA.
 * Only computed style can see it. (`focus-visible:ring-f1-red` is also written literally in
 * `components/tyres/acts/*`, so it is generated either way; its test below is a guard on the
 * colour, not on `content`.)
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

/**
 * The pixels a ring paints on `target`: each sampled point as it looks focused and unfocused.
 *
 * WCAG 2.2 judges a focus indicator by exactly that pair — the same pixels in both states — so
 * nothing here names a backdrop colour. Each sample sits mid-band in a 2px inset ring: the four
 * edge midpoints, and each corner's diagonal 1px inside the panel's visible curve, which is where
 * an `overflow-hidden` parent cuts the corner off a ring that does not bend with it. A computed
 * `box-shadow` cannot see either clip: an outset ring inside that parent reads correctly and
 * paints nothing.
 */
async function ringSamples(page: Page, target: Locator): Promise<{ where: string; focused: Rgb; unfocused: Rgb }[]> {
  const box = await target.boundingBox();
  if (box === null) throw new Error('ringSamples: target is not laid out');
  // The panel's curve as drawn: its radius less its border, measured on the inner edge.
  const curve = await target.evaluate((el) => {
    const panel = getComputedStyle(el.parentElement as Element);
    return parseFloat(panel.borderTopLeftRadius) - parseFloat(panel.borderTopWidth);
  });
  const d = curve - (curve - 1) / Math.SQRT2;
  const { x, y, width: w, height: h } = box;
  const points: [string, number, number][] = [
    ['top', x + w / 2, y + 1],
    ['bottom', x + w / 2, y + h - 1],
    ['left', x + 1, y + h / 2],
    ['right', x + w - 1, y + h / 2],
    ['top-left corner', x + d, y + d],
    ['top-right corner', x + w - d, y + d],
    ['bottom-left corner', x + d, y + h - d],
    ['bottom-right corner', x + w - d, y + h - d],
  ];
  const clip = { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(w) + 1, height: Math.ceil(h) + 1 };
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const read = (png: PNG, px: number, py: number): Rgb => {
    const scale = png.width / clip.width;
    const i = (Math.floor((py - clip.y) * scale) * png.width + Math.floor((px - clip.x) * scale)) * 4;
    return { r: png.data[i] ?? 0, g: png.data[i + 1] ?? 0, b: png.data[i + 2] ?? 0 };
  };

  const focused = PNG.sync.read(await page.screenshot({ clip }));
  await target.evaluate((el) => (el as HTMLElement).blur());
  await settle();
  const unfocused = PNG.sync.read(await page.screenshot({ clip }));
  return points.map(([where, px, py]) => ({ where, focused: read(focused, px, py), unfocused: read(unfocused, px, py) }));
}

/**
 * The tool trace's toggle shipped with no ring utility at all, so focus showed only the browser's
 * outline. The blue sweep below cannot see that: with no `ring-*` class nothing paints a shadow,
 * and the sweep looks for blue inside one. The toggle spans its panel edge to edge, which is why
 * its ring is inset, and red is 2.96:1 on that panel's wash, which is why it is ink.
 */
test('the tool trace toggle paints an ink ring on every side and corner of its panel', async ({ page }) => {
  // A finished run with no backend: the captured stream ends in `briefing` and `complete`.
  await mockBriefingStreams(page, [sseFixture('clean.sse')]);
  await page.goto('/briefing');
  await waitForMain(page);
  await page.getByLabel('Circuit name').fill('Monaco');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const toggle = page.getByRole('button', { name: /^Agent Tool Trace/ });
  await expect(toggle).toBeVisible();
  await toggle.scrollIntoViewIfNeeded();
  await waitForMotionToSettle(page);

  await focusByKeyboard(page, toggle);
  const state = await focusState(toggle);
  expect(state.focusVisible).toBe(true);
  expect(state.boxShadow, 'focusRingInk on the tool trace toggle (lib/focus.ts)').toContain(INK);

  const weak = (await ringSamples(page, toggle))
    .map((s) => ({ ...s, ratio: wcagRatio(s.focused, s.unfocused) }))
    .filter((s) => s.ratio < AA_NON_TEXT)
    .map((s) => `${s.where}: ${s.ratio.toFixed(2)}:1 (${formatCssColor(s.focused)} focused, ${formatCssColor(s.unfocused)} not)`);
  expect(weak, `ring pixels under ${AA_NON_TEXT}:1 against the same pixels unfocused`).toEqual([]);
});

// `/candy` is omitted: it's a pure demo styleguide with no focusable controls by design
// (app/candy/page.tsx), so `tabThroughPage` reaches zero controls there — it's still covered
// by the invisible-text and axe specs.
// Routes are listed by hand, not discovered — a new route joins the sweep only when it is added here.
for (const route of ['/', '/teams', '/tyres', '/circuits', '/circuits/monza', '/credits', '/showcase', '/teardown']) {
  test(`no focusable control on ${route} paints Tailwind's default blue ring`, async ({ page }) => {
    if (route === '/showcase') await watchThreeScenes(page);
    await page.goto(route);
    await waitForMain(page);
    if (route === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (route === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
    // `/showcase`'s `<main>` is in the page shell, so it is up while the scene's chunk still loads.
    if (route === '/showcase') await expect(page.getByRole('heading', { level: 1, name: /Car Showcase/ })).toBeVisible();
    // Under `reduce` the scene is already idle (the sweep measured the same with the loop stopped,
    // 41ms). With motion, every Tab waits for a CPU-rendered frame: 25.1s for this sweep. It reads
    // rings, not pixels, so it never needs the loop.
    if (route === '/showcase') {
      await waitForRealCar(page);
      await stopFrameLoops(page);
    }
    if (route === '/teardown') await expect(page.getByText('Loading frames')).toBeHidden();
    const states = await tabThroughPage(page);
    expect(states.length, 'Tab reached no controls at all').toBeGreaterThan(0);
    const blue = states.filter((s) => s.boxShadow.includes(TAILWIND_DEFAULT_RING)).map((s) => s.label);
    expect(blue, `controls on ${route} whose ring colour rule was never generated`).toEqual([]);
  });
}
