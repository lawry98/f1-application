import AxeBuilder from '@axe-core/playwright';

import { waitForMotionToSettle } from './support/motion';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Known axe findings on `main` that are not this harness's to fix, each with its reason.
 * Keyed by route, value is axe rule ids. Empty is the goal; every entry is a debt with an owner.
 */
const KNOWN: Record<string, string[]> = {};

// Desktop for every route; 390px as well where the layout genuinely changes (the teams chip strip
// replaces the rail, the tyres acts restack), since a violation can live in one layout only.
const PASSES = [
  ...['/', '/teams', '/tyres', '/candy', '/standings'].map((route) => ({ route, width: 1440 })),
  { route: '/teams', width: 390 },
  { route: '/tyres', width: 390 },
];

for (const { route, width } of PASSES) {
  test(`${route} has no WCAG A/AA axe violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    if (route === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    // axe folds opacity into the colours it measures, so a pass that lands mid-fade reports a
    // ratio that depends on timing. `reducedMotion: 'reduce'` does not stop these fades.
    await waitForMotionToSettle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    const unexpected = violations.filter((v) => !(KNOWN[route] ?? []).includes(v.id));
    expect(
      unexpected.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}
