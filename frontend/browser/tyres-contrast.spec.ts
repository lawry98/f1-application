import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { expect, test } from './support/test';

/**
 * Class 2 on /tyres: the Act 3b eyebrow sits under the section's ambient glow, whose tint
 * changes with the selected strategy scenario. A colour lifted against bare `base-warm` has
 * zero headroom for that glow, so every scenario is measured, not just the default: the white
 * and yellow tints are the ones that lighten the backdrop most.
 */
for (const width of [390, 1440]) {
  test(`the Act 3b eyebrow clears AA under every scenario's glow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tyres');
    const section = page.locator('section[aria-labelledby="strategy-heading"]');
    const eyebrow = section.getByText('Act 3b', { exact: true });
    const tabs = section.locator('button[aria-pressed]');
    await expect(tabs).toHaveCount(6);

    for (let i = 0; i < 6; i++) {
      const tab = tabs.nth(i);
      const name = (await tab.textContent())?.replace('(selected)', '').trim() ?? `scenario ${i}`;
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expectContrast(eyebrow, {
        atLeast: AA_SMALL_TEXT,
        site: `Act 3b eyebrow under the strategy glow, ${name}, ${width}px`,
        soft: true,
      });
    }
  });
}
