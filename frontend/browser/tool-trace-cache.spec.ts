import AxeBuilder from '@axe-core/playwright';

import { mockBriefingStreams, sseFixture } from './support/api-mocks';
import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { findInvisibleText } from './support/invisible-text';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * A repeat briefing, as the route serves it (`cached.sse`): the track profile came from the
 * result cache, the news search ran live. jsdom can see that the chip exists and is `zinc-300`;
 * only a browser can see what is actually behind its glyphs — the row wash over the panel wash
 * over the topo texture — and whether a 375px row still fits it.
 */
for (const width of [375, 1440]) {
  test(`a repeat briefing at ${width}px marks the cached tool, says how many, and the chip reads`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockBriefingStreams(page, [sseFixture('cached.sse')]);
    await page.goto('/briefing');
    await waitForMain(page);
    await page.getByLabel('Circuit name').fill('Monaco');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    const toggle = page.getByRole('button', {
      name: 'Agent Tool Trace (2 tools executed, 1 cached)',
      exact: true,
    });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const list = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
    const cachedRow = list.getByRole('listitem').filter({ hasText: 'get_track_info' });
    const liveRow = list.getByRole('listitem').filter({ hasText: 'search_f1_news' });
    const chip = cachedRow.getByText('Cached', { exact: true });
    await expect(chip).toBeVisible();
    await expect(liveRow.getByText('Cached', { exact: true })).toHaveCount(0);

    // What a screen reader gets: the outcome run says it, the chip that restates it is hidden.
    const tree = await list.ariaSnapshot();
    expect(tree).toContain('Succeeded, from cache');
    expect(tree).not.toContain('Cached');

    await list.scrollIntoViewIfNeeded();
    await waitForMotionToSettle(page);

    // The chip must not widen a phone-width row past the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);

    // Page-wide sweeps before `expectContrast`, which hides and restores glyphs.
    const invisible = await findInvisibleText(page);
    expect(invisible.map((t) => `"${t.text}" ${t.color} on ${t.backdrop}`)).toEqual([]);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);

    await expectContrast(chip, {
      atLeast: AA_SMALL_TEXT,
      site: 'tool trace Cached chip over the row wash on the topo page',
    });
  });
}
