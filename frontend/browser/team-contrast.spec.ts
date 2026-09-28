import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { expect, test } from './support/test';

/**
 * Class 2: team colour judged against the wrong backdrop. `readableOnDark` is correct only on
 * bare zinc-950, with zero headroom, so every translucent layer between glyph and page needs
 * its own helper. The unit tests reproduced the mistake twice, because they measured the right
 * colour against the wrong background. Here the backdrop is read from pixels, and axe cannot
 * judge these sites at all ("background could not be determined").
 *
 * Every team is measured, not a sample: a helper can clear AA for ten liveries and miss one.
 */

test.describe('laptop width: rail + section standing', () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test('every team, active in the rail and in its section, clears AA', async ({ page }) => {
    await page.goto('/teams');
    const rail = page.getByRole('navigation', { name: 'Constructors' });
    const rows = rail.getByRole('link');
    await expect(rows).toHaveCount(11);

    for (let i = 0; i < 11; i++) {
      const row = rows.nth(i);
      const href = await row.getAttribute('href');
      const name = (await row.locator('span.font-medium').textContent())?.trim() ?? `row ${i}`;
      await row.click();
      await expect(row).toHaveAttribute('aria-current', 'location');

      await expectContrast(row.locator('span.font-mono'), {
        atLeast: AA_SMALL_TEXT,
        site: `rail active row (railStandingColor over bg-zinc-800/60), ${name}`,
        soft: true,
      });
      await expectContrast(page.locator(`${href} [data-testid="section-standing"]`), {
        atLeast: AA_SMALL_TEXT,
        site: `section standing line (sectionStandingColor inside the glow), ${name}`,
        soft: true,
      });
    }
  });
});

test.describe('desktop width: section standing + compare tray', () => {
  // The glow is 40vw, so at 1440 it is wider than at 1100 and more of it lands on the content
  // column: the section standing line is measured again here rather than assumed from 1100.
  test('every team, active in its section, clears AA at 1440', async ({ page }) => {
    await page.goto('/teams');
    const rows = page.getByRole('navigation', { name: 'Constructors' }).getByRole('link');
    await expect(rows).toHaveCount(11);

    for (let i = 0; i < 11; i++) {
      const row = rows.nth(i);
      const href = await row.getAttribute('href');
      const name = (await row.locator('span.font-medium').textContent())?.trim() ?? `row ${i}`;
      await row.click();
      await expect(row).toHaveAttribute('aria-current', 'location');

      await expectContrast(page.locator(`${href} [data-testid="section-standing"]`), {
        atLeast: AA_SMALL_TEXT,
        site: `section standing line (sectionStandingColor inside the glow), ${name}, 1440px`,
        soft: true,
      });
    }
  });

  test('every leading tray value clears AA', async ({ page }) => {
    await page.goto('/teams');
    const toggles = page.getByRole('button', { name: /^Compare / });
    await expect(toggles).toHaveCount(11);

    // Pairs (0,1) (2,3) … (10,0): every team appears in at least one comparison.
    for (let i = 0; i < 11; i += 2) {
      const a = toggles.nth(i);
      const b = toggles.nth((i + 1) % 11);
      const pair = `${await a.getAttribute('aria-label')} vs ${await b.getAttribute('aria-label')}`;
      await a.click();
      await b.click();
      const leaders = page.locator('[data-testid^="compare-value-"][style*="color"]');
      await expect(leaders.first()).toBeVisible();
      for (const cell of await leaders.all()) {
        await expectContrast(cell, {
          atLeast: AA_SMALL_TEXT,
          site: `compare tray leader (trayValueColor over bg-zinc-900/60), ${pair}`,
          soft: true,
        });
      }
      await page.getByRole('button', { name: 'Clear comparison' }).click();
    }
  });
});
