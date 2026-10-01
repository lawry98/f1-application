import type { Page } from '@playwright/test';

import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

/**
 * Class 8: a scroll that moves the keyboard's starting point. Chromium moves the sequential focus
 * navigation starting point to whatever element `scrollIntoView()` was called on, focusable or
 * not. The site nav called it on the current page's link to centre it in the row, so on every
 * route with a nav link the first Tab skipped the wordmark and landed on the link *after* the
 * current one: `/tyres` → "Circuits", `/credits` → nothing in the nav at all. The `/teams` chip
 * strip did the same with its active chip, at 375 → "FerrariP2".
 *
 * Nothing but a browser has a focus navigation starting point, so jsdom cannot see this.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

/**
 * Resolves once React has hydrated the nav and the main thread has gone idle.
 *
 * The defect lives in a mount effect, and `waitForMain` only says the server's HTML is showing. A
 * Tab pressed before the effect runs passes on the broken tree. A fibre on the row says hydration
 * has reached it; the idle callback says the scheduler's queue — the rest of hydration and the
 * passive effects after it — has drained.
 */
async function waitForHydratedNav(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const row = document.querySelector('nav[aria-label="Main navigation"] ul');
    return row !== null && Object.keys(row).some((key) => key.startsWith('__reactFiber$'));
  });
  await page.evaluate(
    () => new Promise((resolve) => requestIdleCallback(() => resolve(null), { timeout: 2_000 })),
  );
}

/** Routes with a nav link of their own; `/teams` also has the chip strip below `lg`. */
const ROUTES = ['/tyres', '/credits', '/teams'];

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    for (const route of ROUTES) {
      // The width is in the title, not only the describe: the mutant runner keys results by title.
      test(`the first Tab on ${route} at ${viewport.width}px reaches the wordmark`, async ({
        page,
      }) => {
        await page.goto(route);
        await waitForMain(page);
        await waitForHydratedNav(page);

        await page.keyboard.press('Tab');

        const focused = await page.evaluate(() =>
          (document.activeElement?.textContent ?? '').trim(),
        );
        await expect(
          nav(page).getByRole('link', { name: 'F1 Briefing Agent' }),
          `the first Tab focused "${focused}"`,
        ).toBeFocused();
      });
    }
  });
}

/*
 * The fix must keep what the scroll was for: arriving on a route, its link is centred in the row,
 * or as near as the row's ends allow. `/credits` arriving at the row's end is pinned in
 * nav-overflow.spec.ts.
 */
test.describe('on a 375 × 812 phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('arriving on /tyres, its link is centred in the nav row', async ({ page }) => {
    await page.goto('/tyres');
    await waitForMain(page);
    await waitForHydratedNav(page);

    const link = nav(page).getByRole('link', { name: 'Tyres', exact: true });
    const offCentre = await link.evaluate((el) => {
      const row = el.closest('ul')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.left + box.width / 2 - (row.left + row.width / 2);
    });
    expect(
      Math.abs(offCentre),
      'the Tyres link’s distance from the row’s centre',
    ).toBeLessThanOrEqual(1);
  });

  test('scrolling /teams to a later team centres its chip in the strip', async ({ page }) => {
    await page.goto('/teams');
    await waitForMain(page);
    await waitForHydratedNav(page);

    const strip = page.getByRole('navigation', { name: 'Constructor navigation, compact' });
    await page.evaluate(() => document.getElementById('team-williams')!.scrollIntoView());
    const chip = strip.getByRole('link', { name: /williams/i });
    await expect(chip).toHaveAttribute('aria-current', 'location');

    // The page runs under `reducedMotion: 'reduce'`, so the strip jumps rather than pans.
    await expect
      .poll(
        () =>
          chip.evaluate((el) => {
            const row = el.parentElement!.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return Math.abs(box.left + box.width / 2 - (row.left + row.width / 2));
          }),
        { message: 'the Williams chip’s distance from the strip’s centre' },
      )
      .toBeLessThanOrEqual(1);
  });
});
