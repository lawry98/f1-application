import AxeBuilder from '@axe-core/playwright';

import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** `/briefing` showing a saved example: a view of its own, with its label, card and trace. */
const EXAMPLE_ROUTE = '/briefing?example=2026-06-monaco-grand-prix';

/**
 * Known axe findings on `main` that are not this harness's to fix, each with its reason.
 * Keyed by route, value is axe rule ids. Empty is the goal; every entry is a debt with an owner.
 */
const KNOWN: Record<string, string[]> = {};

// Desktop for every route; 390px as well where the layout genuinely changes (the teams chip strip
// replaces the rail, the tyres acts restack), since a violation can live in one layout only.
const PASSES = [
  ...[
    '/',
    '/teams',
    '/tyres',
    '/candy',
    '/standings',
    '/circuits',
    '/circuits/monza',
    '/credits',
    '/showcase',
    '/teardown',
    EXAMPLE_ROUTE,
  ].map((route) => ({
    route,
    width: 1440,
  })),
  { route: '/teams', width: 390 },
  { route: '/tyres', width: 390 },
  { route: '/circuits', width: 390 },
  { route: '/circuits/monza', width: 390 },
  // The credit tables, the portrait 3D canvas and the teardown's own bar all change at a phone's width.
  { route: '/credits', width: 390 },
  { route: '/showcase', width: 390 },
  { route: '/teardown', width: 390 },
  { route: EXAMPLE_ROUTE, width: 390 },
];

for (const { route, width } of PASSES) {
  test(`${route} has no WCAG A/AA axe violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await waitForMain(page);
    if (route === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    if (route === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (route === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
    if (route === EXAMPLE_ROUTE) await expect(page.getByText(/^Saved example · /)).toBeVisible();
    // `/showcase`'s `<main>` is in the page shell, so it is up while the scene's chunk still loads.
    // Its scene renders WebGL on the CPU without pause, so it gets `shadow-acne.spec.ts`'s allowance.
    if (route === '/showcase') test.slow();
    if (route === '/showcase') await expect(page.getByRole('heading', { level: 1, name: /Car Showcase/ })).toBeVisible();
    if (route === '/teardown') await expect(page.getByText('Loading frames')).toBeHidden();
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
