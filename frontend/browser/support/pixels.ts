import type { Locator } from '@playwright/test';
import { PNG } from 'pngjs';

import type { Rgb } from './color';

/**
 * CLAUDE.md's pixel method, ported off macOS: hide only the glyphs, screenshot, read what is
 * behind them. A Buffer decoded by pngjs; no `sips`, no BMP, no temp file.
 *
 * Two traps are designed out rather than remembered:
 *
 * 1. **An element's own background must survive.** `visibility: hidden` hides a monogram tile's
 *    fill along with its text, so the reading is the page. This makes the glyphs *transparent*
 *    instead (`color`, `-webkit-text-fill-color`, `text-shadow`), which leaves backgrounds,
 *    borders and siblings painted.
 * 2. **`TextAnimate` renders an `sr-only` copy beside the painted `aria-hidden` spans.** Measuring
 *    the accessible copy reports 1:1. The copy is a 1px clipped box, so it is refused outright.
 *
 * Anything drawn in `currentColor` (an inline SVG icon, a `border-current`) goes transparent
 * too. That is intended: it is glyph-like, and it is not the backdrop.
 */

const HIDE_ATTR = 'data-harness-hide-glyphs';
const HIDE_STYLE_ID = 'harness-hide-glyphs';

async function assertPaintedGlyphs(target: Locator): Promise<void> {
  const info = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      clipped: style.position === 'absolute' && style.clip !== 'auto',
      text: (el.textContent ?? '').trim(),
    };
  });
  if (info.width <= 1 || info.height <= 1 || info.clipped) {
    throw new Error(
      `backdropBehindGlyphs: "${info.text}" is a screen-reader-only copy (${info.width}x${info.height}); ` +
        'measure the painted aria-hidden glyphs instead',
    );
  }
  if (info.text === '') throw new Error('backdropBehindGlyphs: target has no text to hide');
}

/** Per-channel median over the whole image: robust to leftover anti-aliasing and gradient edges. */
export function medianPixel(png: PNG): Rgb {
  const count = png.width * png.height;
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < count; i++) {
    channels[0].push(png.data[i * 4] ?? 0);
    channels[1].push(png.data[i * 4 + 1] ?? 0);
    channels[2].push(png.data[i * 4 + 2] ?? 0);
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  return { r: median(channels[0]), g: median(channels[1]), b: median(channels[2]) };
}

export async function backdropBehindGlyphs(target: Locator): Promise<Rgb> {
  await assertPaintedGlyphs(target);
  await target.evaluate(
    (el, [attr, styleId]) => {
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent =
          `[${attr}], [${attr}] * { color: transparent !important; ` +
          '-webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
        document.head.appendChild(style);
      }
      el.setAttribute(attr, '');
    },
    [HIDE_ATTR, HIDE_STYLE_ID] as const,
  );
  try {
    // Two frames: one to restyle, one to paint.
    await target.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const buffer = await target.screenshot({ animations: 'disabled', caret: 'hide' });
    return medianPixel(PNG.sync.read(buffer));
  } finally {
    await target.evaluate((el, attr) => el.removeAttribute(attr), HIDE_ATTR);
  }
}
