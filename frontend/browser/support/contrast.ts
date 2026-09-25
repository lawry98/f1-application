import { expect, type Locator } from '@playwright/test';

import { composite, formatCssColor, parseCssColor, wcagRatio, type Rgb } from './color';
import { backdropBehindGlyphs } from './pixels';

/** WCAG 1.4.3 AA for text under 18pt / 14pt bold — every team-coloured label on the site. */
export const AA_SMALL_TEXT = 4.5;

/** WCAG 1.4.11 / 2.4.11 non-text bar, e.g. focus indicators. */
export const AA_NON_TEXT = 3;

export interface ContrastMeasurement {
  ratio: number;
  /** The text colour as painted: its computed colour composited over the backdrop. */
  text: Rgb;
  /** What the screenshot shows behind the glyphs. */
  backdrop: Rgb;
}

/**
 * The text colour comes from the painted node's computed style, and the backdrop from pixels.
 * That split is the point: the defect this catches is a helper judging the right colour
 * against the wrong background, so the background has to be what is actually on screen.
 */
export async function measureContrast(target: Locator): Promise<ContrastMeasurement> {
  const backdrop = await backdropBehindGlyphs(target);
  const { color, opacity } = await target.evaluate((el) => {
    let product = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      product *= Number(getComputedStyle(node).opacity);
    }
    return { color: getComputedStyle(el).color, opacity: product };
  });
  if (opacity < 1) {
    throw new Error(`measureContrast: target is painted at opacity ${opacity}; measure after its motion settles`);
  }
  const text = composite(parseCssColor(color), backdrop);
  return { ratio: wcagRatio(text, backdrop), text, backdrop };
}

/**
 * Asserts a WCAG floor and names the site, so the expectation documents intent (which bar, on
 * which surface) and a failure prints everything needed to act on it. No ratio is pinned.
 */
export async function expectContrast(
  target: Locator,
  { atLeast, site, soft = false }: { atLeast: number; site: string; soft?: boolean },
): Promise<ContrastMeasurement> {
  const m = await measureContrast(target);
  const message =
    `${site}: ${m.ratio.toFixed(2)}:1, needs ${atLeast}:1 ` +
    `(text ${formatCssColor(m.text)} on backdrop ${formatCssColor(m.backdrop)})`;
  if (soft) expect.soft(m.ratio, message).toBeGreaterThanOrEqual(atLeast);
  else expect(m.ratio, message).toBeGreaterThanOrEqual(atLeast);
  return m;
}
