import { expect, test } from './support/test';

test('the production server serves the landing page with its stylesheet applied', async ({ page }) => {
  await page.goto('/');
  // A computed value, not a class: if Tailwind's CSS failed to load this is the browser default.
  const bg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});

test('/standings renders from the mocked API, with no backend running', async ({ page }) => {
  await page.goto('/standings');
  await expect(page.getByRole('table').first()).toBeVisible();
});
