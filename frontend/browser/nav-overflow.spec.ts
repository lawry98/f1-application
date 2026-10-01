import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { composite, formatCssColor, parseCssColor, wcagRatio } from './support/color';
import { AA_NON_TEXT, AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { focusByKeyboard, focusState } from './support/css';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { medianPixel } from './support/pixels';
import { expect, test } from './support/test';

/**
 * Class 7: a scroller that gives no sign it scrolls. At 375 px the site nav's link row shows about
 * two of its eight links, its scrollbar is hidden, and before the edge fades nothing said there
 * was more. The fades are driven by scroll position, so whether one is showing is only knowable
 * where something lays the row out — jsdom models it (`tests/landing-nav.test.tsx`), and this is
 * the real one.
 *
 * The labels are **copied** from components/landing/links.ts, not imported, for the reason
 * scroll-spy.spec.ts copies its band: a mutant that breaks an export would otherwise be "killed"
 * by a compile error.
 */
const LABELS = ['Briefing', 'Car Anatomy', 'Tyres', 'Circuits', 'Standings', 'Teams', 'Showcase', 'Credits'];
const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** How far a ring paints outside its link: `ring-offset-2` plus `ring-2` (lib/focus.ts). */
const RING_REACH = 4;

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const row = (page: Page) => nav(page).getByRole('list');
const fade = (page: Page, edge: 'start' | 'end') => nav(page).getByTestId(`nav-fade-${edge}`);
const opacityOf = (target: Locator) => target.evaluate((el) => Number(getComputedStyle(el).opacity));

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Everything that decides whether the focused link's ring can be seen, read in one pass. */
function ringGeometry(page: Page) {
  return page.evaluate((reach) => {
    const link = document.activeElement as HTMLElement;
    const list = link.closest('ul');
    if (!list) throw new Error('focus is not in the nav row');
    const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    const l = link.getBoundingClientRect();
    const fades = Array.from(list.parentElement?.querySelectorAll<HTMLElement>('[data-testid^="nav-fade-"]') ?? [])
      .filter((f) => Number(getComputedStyle(f).opacity) > 0)
      .map((f) => ({ edge: f.dataset.testid ?? '', ...box(f.getBoundingClientRect()) }));
    return {
      label: (link.textContent ?? '').trim(),
      ring: { left: l.left - reach, right: l.right + reach, top: l.top - reach, bottom: l.bottom + reach },
      row: box(list.getBoundingClientRect()),
      fades,
    };
  }, RING_REACH);
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Whether the ring is actually painted red on all four sides, read from the screenshot. The
 * geometry above says nothing covers it; this says the ring is there to be seen. Each sample sits
 * in the middle of the 2 px ring band, outside the 2 px offset band.
 */
async function ringSidesPainted(page: Page, ring: Box): Promise<Record<'left' | 'right' | 'top' | 'bottom', boolean>> {
  const png = PNG.sync.read(await page.screenshot());
  const midX = (ring.left + ring.right) / 2;
  const midY = (ring.top + ring.bottom) / 2;
  const isRed = (x: number, y: number) => {
    const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
    const [r, g, b] = [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
    return r > 150 && g < 70 && b < 70;
  };
  return {
    left: isRed(ring.left + 1, midY),
    right: isRed(ring.right - 1, midY),
    top: isRed(midX, ring.top + 1),
    bottom: isRed(midX, ring.bottom - 1),
  };
}

/**
 * Whether a fade's chevron is on screen, and its contrast against what is behind it.
 *
 * Read as a difference: the chevron's box is screenshotted as painted, then again with only the
 * chevron hidden, and the pixels that change are the chevron's. A link glyph that happens to sit
 * under the fade cannot pass for it, and an opacity-0 fade changes nothing. The second shot is
 * also the backdrop the stroke is judged against.
 */
async function chevronPaint(page: Page, edge: 'start' | 'end') {
  const chevron = fade(page, edge).locator('svg');
  const box = await chevron.boundingBox();
  if (!box) throw new Error(`the ${edge} chevron is not laid out`);
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width) + 1, height: Math.ceil(box.height) + 1 };
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const shown = PNG.sync.read(await page.screenshot({ clip }));
  await chevron.evaluate((el) => el.setAttribute('visibility', 'hidden'));
  await settle();
  const hidden = PNG.sync.read(await page.screenshot({ clip }));
  await chevron.evaluate((el) => el.removeAttribute('visibility'));

  let changed = 0;
  for (let i = 0; i < shown.data.length; i += 4) {
    const delta = Math.max(...[0, 1, 2].map((c) => Math.abs((shown.data[i + c] ?? 0) - (hidden.data[i + c] ?? 0))));
    if (delta > 40) changed++;
  }
  const backdrop = medianPixel(hidden);
  const stroke = composite(parseCssColor(await chevron.evaluate((el) => getComputedStyle(el).color)), backdrop);
  return { changed, ratio: wcagRatio(stroke, backdrop), stroke: formatCssColor(stroke), backdrop: formatCssColor(backdrop) };
}

test.describe('on a 375 × 812 phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the row overflows, and on load only the end fade shows', async ({ page }) => {
    await page.goto('/');
    await waitForMain(page);

    const { clientWidth, scrollWidth } = await row(page).evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(scrollWidth, 'at 375 the row should overflow, or this test is about nothing').toBeGreaterThan(clientWidth);
    await expect.poll(() => opacityOf(fade(page, 'end')), { message: 'the end fade on load' }).toBe(1);
    expect(await opacityOf(fade(page, 'start')), 'the start fade on load').toBe(0);
  });

  /*
   * At 375 the row's first overflow falls in the gap after "Car Anatomy": only 6.5 px of "Tyres"
   * reached the old 24 px end fade, so on load it painted over empty header and hinted at nothing.
   * The chevron is drawn in the fade itself, so it is there whatever the row is cut at.
   */
  test('on load the end chevron is painted and clears the non-text bar', async ({ page }) => {
    await page.goto('/');
    await waitForMain(page);
    await expect.poll(() => opacityOf(fade(page, 'end'))).toBe(1);

    const end = await chevronPaint(page, 'end');
    expect(end.changed, 'pixels the end chevron paints').toBeGreaterThan(5);
    expect(end.ratio, `end chevron ${end.stroke} on ${end.backdrop}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  test('scrolled to the end, the start chevron is painted and clears the non-text bar', async ({ page }) => {
    await page.goto('/');
    await waitForMain(page);
    await row(page).evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => opacityOf(fade(page, 'start'))).toBe(1);

    const start = await chevronPaint(page, 'start');
    expect(start.changed, 'pixels the start chevron paints').toBeGreaterThan(5);
    expect(start.ratio, `start chevron ${start.stroke} on ${start.backdrop}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  test('scrolled to the end, the start fade shows and the end fade goes', async ({ page }) => {
    await page.goto('/');
    await waitForMain(page);
    await expect.poll(() => opacityOf(fade(page, 'end'))).toBe(1);

    await row(page).evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });

    await expect.poll(() => opacityOf(fade(page, 'start')), { message: 'the start fade at the end' }).toBe(1);
    expect(await opacityOf(fade(page, 'end')), 'the end fade at the end').toBe(0);
  });

  test('arriving on the last link’s page, the row is already at its end', async ({ page }) => {
    // The current link is scrolled into view on mount, so the fades have to be right for a row
    // that never received a user scroll.
    await page.goto('/credits');
    await waitForMain(page);

    await expect.poll(() => opacityOf(fade(page, 'start')), { message: 'the start fade on /credits' }).toBe(1);
    expect(await opacityOf(fade(page, 'end')), 'the end fade on /credits').toBe(0);
  });

  test('Tab reaches all eight links, each ring painted where no fade covers it and the row does not clip it', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForMain(page);
    await expect.poll(() => opacityOf(fade(page, 'end'))).toBe(1);

    await focusByKeyboard(page, nav(page).getByRole('link', { name: LABELS[0], exact: true }));
    const problems: string[] = [];
    for (const [index, label] of LABELS.entries()) {
      if (index > 0) await page.keyboard.press('Tab');
      const link = nav(page).getByRole('link', { name: label, exact: true });
      await expect(link, `Tab ${index + 1} should reach "${label}"`).toBeFocused();
      // The fades follow the row's scroll event, which lands a frame after the focus scroll.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const state = await focusState(link);
      if (!state.focusVisible) problems.push(`${label}: not :focus-visible`);
      if (!state.boxShadow.includes('rgb(225, 6, 0)')) problems.push(`${label}: no red ring in ${state.boxShadow}`);

      const { ring, row: box, fades } = await ringGeometry(page);
      if (ring.left < box.left || ring.right > box.right || ring.top < box.top || ring.bottom > box.bottom) {
        problems.push(`${label}: ring ${JSON.stringify(ring)} clipped by the row ${JSON.stringify(box)}`);
      }
      for (const f of fades) {
        if (overlaps(ring, f)) problems.push(`${label}: ring under ${f.edge}`);
      }
      const sides = await ringSidesPainted(page, ring);
      const unpainted = Object.entries(sides)
        .filter(([, red]) => !red)
        .map(([side]) => side);
      if (unpainted.length > 0) problems.push(`${label}: ring not painted on ${unpainted.join(', ')}`);
    }
    expect(problems).toEqual([]);
  });

  test('once motion settles, the nav passes axe and every link clears AA', async ({ page }) => {
    await page.goto('/');
    await waitForMain(page);
    await waitForMotionToSettle(page);

    const { violations } = await new AxeBuilder({ page })
      .include('nav[aria-label="Main navigation"]')
      .withTags(WCAG_A_AA)
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    // Each link measured where a reader would read it: centred in the row, clear of both fades.
    for (const label of LABELS) {
      const link = nav(page).getByRole('link', { name: label, exact: true });
      await link.evaluate((el) => el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expectContrast(link, { atLeast: AA_SMALL_TEXT, site: `nav link "${label}" on the header at 375` });
    }
  });
});

for (const width of [1024, 1440]) {
  test(`at ${width}px every link fits and neither fade shows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitForMain(page);
    await waitForMotionToSettle(page);

    const { clientWidth, scrollWidth } = await row(page).evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(scrollWidth, `at ${width} every link should fit`).toBeLessThanOrEqual(clientWidth);
    expect(await opacityOf(fade(page, 'start')), 'the start fade').toBe(0);
    expect(await opacityOf(fade(page, 'end')), 'the end fade').toBe(0);
  });
}
