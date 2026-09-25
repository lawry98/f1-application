import { expect, test } from '@playwright/test';

import { formatCssColor } from './support/color';
import { measureContrast } from './support/contrast';
import { focusByKeyboard, focusState, hasRule } from './support/css';
import { backdropBehindGlyphs } from './support/pixels';

/**
 * The harness's own tests. Each case is a page whose answer is known by construction, so a
 * helper that reads the wrong pixel, or measures the wrong node, fails here rather than
 * quietly passing a real page.
 */
test.describe('harness self-test', () => {
  test('reads the backdrop, not the glyphs', async ({ page }) => {
    await page.setContent(
      '<div style="background:#1b1b1e;padding:8px"><span id="t" style="color:#fff;font:700 40px sans-serif">MMMM</span></div>',
    );
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(27, 27, 30)');
  });

  test("keeps an element's own background painted (CLAUDE.md trap 1)", async ({ page }) => {
    // `visibility: hidden` would erase this fill with the text and read the white page instead.
    await page.setContent(
      '<body style="background:#fff"><span id="t" style="background:#e10600;color:#fff;font:700 40px sans-serif">MM</span></body>',
    );
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(225, 6, 0)');
  });

  test('sees a translucent layer painted by a sibling, which getComputedStyle cannot', async ({ page }) => {
    await page.setContent(`
      <div style="background:#09090b;padding:8px">
        <div style="position:relative">
          <div style="position:absolute;inset:0;background:rgb(39 39 42 / 0.6)"></div>
          <span id="t" style="position:relative;color:#a1a1aa;font:700 40px sans-serif">MM</span>
        </div>
      </div>`);
    // Float sRGB gives rgb(39 39 42 / 0.6) over #09090b as 27, 27, 29.6 — but Skia's 8-bit blend
    // premultiplies and unpremultiplies in two separately rounded steps, landing one count low on
    // every channel: rgb(26, 26, 29), measured. A helper that missed this sibling layer entirely
    // would read the page's own background instead: rgb(9, 9, 11).
    expect(formatCssColor(await backdropBehindGlyphs(page.locator('#t')))).toBe('rgb(26, 26, 29)');
  });

  test('refuses a screen-reader-only copy (CLAUDE.md trap 2, TextAnimate)', async ({ page }) => {
    await page.setContent(
      '<span id="t" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">P1</span>',
    );
    await expect(backdropBehindGlyphs(page.locator('#t'))).rejects.toThrow(/screen-reader-only/);
  });

  test('restores the glyphs after measuring', async ({ page }) => {
    await page.setContent('<span id="t" style="color:#fff;background:#000;font:40px sans-serif">MM</span>');
    await backdropBehindGlyphs(page.locator('#t'));
    expect(await page.locator('#t').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  });

  test('measures a known ratio end to end', async ({ page }) => {
    await page.setContent('<span id="t" style="color:#fff;background:#767676;font:40px sans-serif">MM</span>');
    expect((await measureContrast(page.locator('#t'))).ratio).toBeCloseTo(4.54, 2);
  });

  test('refuses to measure mid-fade', async ({ page }) => {
    await page.setContent('<div style="opacity:.5"><span id="t" style="color:#fff;background:#000;font:40px sans-serif">MM</span></div>');
    await expect(measureContrast(page.locator('#t'))).rejects.toThrow(/opacity/);
  });

  test('reads a keyboard focus ring and a generated rule', async ({ page }) => {
    await page.setContent(`
      <style>.ring:focus-visible { outline: none; box-shadow: 0 0 0 2px rgb(225, 6, 0); --tw-ring-color: rgb(225 6 0 / 1); }</style>
      <a href="#a">first</a><a id="t" class="ring" href="#b">target</a>`);
    const target = page.locator('#t');
    await focusByKeyboard(page, target);
    const state = await focusState(target);
    expect(state.focusVisible).toBe(true);
    expect(state.ringColor).toBe('rgb(225, 6, 0)');
    expect(await hasRule(page, '.ring:focus-visible')).toBe(true);
    expect(await hasRule(page, '.absent:focus-visible')).toBe(false);
  });
});
