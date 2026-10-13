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
 * only a browser can say whether it sits inside its row without squeezing the tool id, and what
 * colour is actually behind its glyphs. The harness reads that as the median pixel of the glyph
 * box, which on this page is the panel's flat wash between the topo lines (rgb(22, 22, 23)), not
 * the texture itself.
 */
for (const width of [375, 1440]) {
  test(`a repeat briefing at ${width}px marks only the cached tool, says how many, and the chip reads and sits in its row`, async ({
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
    // Each row exists exactly once, or the "no chip on the live row" count below proves nothing.
    await expect(cachedRow).toHaveCount(1);
    await expect(liveRow).toHaveCount(1);
    const chip = cachedRow.getByText('Cached', { exact: true });
    await expect(chip).toBeVisible();
    await expect(liveRow.getByText('Cached', { exact: true })).toHaveCount(0);

    // What a screen reader gets: the outcome run says it, the chip that restates it is hidden.
    const tree = await list.ariaSnapshot();
    expect(tree).toContain('Succeeded, from cache');
    expect(tree).not.toContain('Cached');
    // And the live row's outcome does not claim a cache hit it did not have.
    const liveTree = await liveRow.ariaSnapshot();
    expect(liveTree).toContain('Failed');
    expect(liveTree).not.toContain('from cache');

    await list.scrollIntoViewIfNeeded();
    await waitForMotionToSettle(page);

    // The page does not scroll sideways. On its own this is weak: the row is a flex box whose id
    // column is `min-w-0 flex-1 truncate`, so a chip that is too wide squeezes the id instead of
    // pushing the page. The two row-level checks below are the ones that can see that.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);

    // The chip lies inside its row's box...
    const chipBox = await chip.boundingBox();
    const rowBox = await cachedRow.boundingBox();
    expect(chipBox, 'chip has a box').not.toBeNull();
    expect(rowBox, 'cached row has a box').not.toBeNull();
    expect(chipBox!.x, 'chip left edge vs its row').toBeGreaterThanOrEqual(rowBox!.x);
    expect(chipBox!.x + chipBox!.width, 'chip right edge vs its row').toBeLessThanOrEqual(
      rowBox!.x + rowBox!.width,
    );
    // ...and it left the raw tool id its full width: `truncate` paints an ellipsis exactly when
    // the text overflows its box.
    const id = await cachedRow
      .locator('p')
      .filter({ hasText: 'get_track_info' })
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(id.scrollWidth, 'get_track_info truncated by the chip').toBeLessThanOrEqual(
      id.clientWidth,
    );

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
