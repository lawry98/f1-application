import { expect, test } from '@playwright/test';

test('the production server serves the landing page with its stylesheet applied', async ({ page }) => {
  await page.goto('/');
  // A computed value, not a class: if Tailwind's CSS failed to load this is the browser default.
  const bg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});
