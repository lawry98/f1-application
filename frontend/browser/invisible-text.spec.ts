import { waitForMotionToSettle } from './support/motion';
import { findInvisibleText } from './support/invisible-text';
import { waitForMain } from './support/page-content';
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
  { path: '/circuits', width: 1440 },
  { path: '/circuits/monza', width: 1440 },
  { path: '/credits', width: 1440 },
  { path: '/showcase', width: 1440 },
  { path: '/teardown', width: 1440 },
] as const;

for (const { path, width } of ROUTES) {
  test(`${path} at ${width}px paints no text in its own backdrop colour`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await waitForMain(page);
    if (path === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    if (path === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (path === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
    // `/showcase`'s `<main>` is in the page shell, so it is up while the scene's chunk still loads.
    // Its scene renders WebGL on the CPU without pause, so it gets `shadow-acne.spec.ts`'s allowance.
    if (path === '/showcase') test.slow();
    if (path === '/showcase') await expect(page.getByRole('heading', { level: 1, name: /Car Showcase/ })).toBeVisible();
    if (path === '/teardown') await expect(page.getByText('Loading frames')).toBeHidden();
    // axe folds a mid-fade opacity into the colours it measures, and so does a direct pixel read:
    // entrance motion still fades opacity under `reducedMotion: 'reduce'` (BlurFade, the teams
    // dossier's swap), so a check that lands mid-fade reports a ratio that depends on timing.
    await waitForMotionToSettle(page);
    const invisible = await findInvisibleText(page);
    expect(
      invisible.map((t) => `"${t.text}" ${t.color} on ${t.backdrop} (${t.ratio.toFixed(2)}:1) at ${t.path}`),
      'text that is present in the DOM but not on the screen',
    ).toEqual([]);
  });
}
