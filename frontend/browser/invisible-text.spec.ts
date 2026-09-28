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
