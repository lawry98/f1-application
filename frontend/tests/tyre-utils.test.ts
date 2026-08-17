import { describe, it, expect } from 'vitest';

import { COMPOUND_COLORS } from '@/data/tyres-data';
import {
  contrastRatio,
  readableOnDark,
  DARK_BG,
  MIN_CONTRAST,
  MIN_RING_CONTRAST,
} from '@/lib/team-utils';
import {
  EYEBROW_RED,
  TYRE_GLOW_PEAK,
  compoundCardBackdrop,
  compoundGlowBackdrop,
  compoundRing,
  compoundTabBackdrop,
  compoundTextOnTab,
  compoundTrackedRowBackdrop,
  compoundTextOnTrackedRow,
  compoundTextOnCard,
  compoundTextOnGlow,
} from '@/lib/tyre-utils';

const COLORS = Object.entries(COMPOUND_COLORS);

/*
 * This repo has shipped the same contrast mistake twice: an assertion that measures the
 * right colour against the *wrong background*. It passes while the rendered page fails,
 * because `readableOnDark` clears 4.5:1 on bare `zinc-950` by construction and therefore has
 * zero headroom for any wash, card or glow between the glyphs and the page.
 *
 * So every surface compound colour carries text on is asserted separately, against the
 * composite that is genuinely behind it.
 */

describe('compoundTextOnGlow', () => {
  it.each(COLORS)('lifts %s to AA on its own glow', (_name, hex) => {
    expect(
      contrastRatio(compoundTextOnGlow(hex), compoundGlowBackdrop(hex)),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  /*
   * The reason this helper exists rather than reusing `readableOnDark`. If the page-background
   * helper were good enough here, this test would be dead weight — it fails on real compounds,
   * which is the evidence that the glow needs its own backdrop.
   */
  it('is needed: the page helper falls short on at least one compound over the glow', () => {
    const short = COLORS.filter(
      ([, hex]) => contrastRatio(readableOnDark(hex), compoundGlowBackdrop(hex)) < MIN_CONTRAST,
    );
    expect(short.length).toBeGreaterThan(0);
  });
});

describe('compoundTextOnCard', () => {
  it.each(COLORS)('lifts %s to AA on a zinc-900/60 card', (_name, hex) => {
    expect(contrastRatio(compoundTextOnCard(hex), compoundCardBackdrop())).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });

  // `zinc-900` at 0.6 over `zinc-950` flattens to something *lighter* than the page, so it is
  // a harder background to read on, not an easier one.
  it('sits on a backdrop lighter than the page', () => {
    expect(contrastRatio(compoundCardBackdrop(), '#ffffff')).toBeLessThan(
      contrastRatio(DARK_BG, '#ffffff'),
    );
  });

  it('is needed: the page helper falls short on at least one compound over the card', () => {
    const short = COLORS.filter(
      ([, hex]) => contrastRatio(readableOnDark(hex), compoundCardBackdrop()) < MIN_CONTRAST,
    );
    expect(short.length).toBeGreaterThan(0);
  });
});

describe('compoundTextOnTab', () => {
  it.each(COLORS)('lifts %s to AA on the active tab highlight', (_name, hex) => {
    expect(contrastRatio(compoundTextOnTab(hex), compoundTabBackdrop())).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });

  // Found in a browser, not here: the tab highlight is lighter than the card, so it is the
  // strictest of the four backdrops and the page helper falls furthest short on it.
  it('is needed: the page helper falls short on at least one compound over the tab', () => {
    const short = COLORS.filter(
      ([, hex]) => contrastRatio(readableOnDark(hex), compoundTabBackdrop()) < MIN_CONTRAST,
    );
    expect(short.length).toBeGreaterThan(0);
  });

  it('sits on a backdrop lighter than the card', () => {
    expect(contrastRatio(compoundTabBackdrop(), '#ffffff')).toBeLessThan(
      contrastRatio(compoundCardBackdrop(), '#ffffff'),
    );
  });
});

describe('compoundTextOnTrackedRow', () => {
  /*
   * Fifth backdrop, and the reason it exists is the mistake this file opens by warning about,
   * made once more. The allocation section highlights the row carrying the tracked compound with
   * an extra `bg-zinc-800/70` *on top of* the card, and the label inside it was coloured with
   * `compoundTextOnCard` — which is judged against the card alone. Soft measured 4.60:1 on the
   * card and 3.95:1 where it actually sits, at ~12px, and Soft is the tracked row at Suzuka.
   */
  it.each(COLORS)('lifts %s to AA on the highlighted allocation row', (_name, hex) => {
    expect(
      contrastRatio(compoundTextOnTrackedRow(hex), compoundTrackedRowBackdrop()),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('is needed: the card helper falls short on at least one compound over the row', () => {
    const short = COLORS.filter(
      ([, hex]) =>
        contrastRatio(compoundTextOnCard(hex), compoundTrackedRowBackdrop()) < MIN_CONTRAST,
    );
    expect(short.length).toBeGreaterThan(0);
  });

  it('sits on a backdrop lighter than the card it is drawn on', () => {
    expect(contrastRatio(compoundTrackedRowBackdrop(), '#ffffff')).toBeLessThan(
      contrastRatio(compoundCardBackdrop(), '#ffffff'),
    );
  });

  /*
   * It happens to land on the same hex as the tab highlight. That is arithmetic coincidence, not
   * a relationship — the tab is `zinc-800/80` over the page, this is `zinc-800/70` over a card —
   * so the two must stay separate functions or a change to either silently moves the other.
   */
  it('is derived independently of the tab backdrop', () => {
    expect(compoundTrackedRowBackdrop()).not.toBe(DARK_BG);
  });
});

describe('compoundRing', () => {
  it.each(COLORS)('lifts %s to the non-text bar for a focus ring', (_name, hex) => {
    expect(contrastRatio(compoundRing(hex), DARK_BG)).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
  });
});

describe('TYRE_GLOW_PEAK', () => {
  /*
   * The glow's opacity is a contrast constraint, not a taste one — the same lesson
   * `GLOW_PEAK_OPACITY` records for the teams page. At full strength the composite behind the
   * copy admits no readable colour at all for the brighter compounds.
   */
  it('is weak enough that a readable colour exists over every compound', () => {
    for (const [name, hex] of COLORS) {
      const best = contrastRatio('#ffffff', compoundGlowBackdrop(hex));
      expect(best, `white over ${name}'s glow`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('stays below the strength at which the brightest compound loses white text', () => {
    expect(TYRE_GLOW_PEAK).toBeLessThan(0.5);
  });
});

describe('EYEBROW_RED', () => {
  /*
   * `/credits` already carries the note that `f1-red` is 4.12:1 on zinc-950 and so is
   * "text-2xl and up only" — yet eyebrow labels across the site use it at `text-sm`. Rather
   * than copy that failure onto a new page, /tyres lifts it. At 14px the two are
   * indistinguishable; only the ratio changes.
   */
  it('clears AA where the raw token does not', () => {
    expect(contrastRatio('#dc2626', DARK_BG)).toBeLessThan(MIN_CONTRAST);
    expect(contrastRatio(EYEBROW_RED, DARK_BG)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('still reads as red rather than washing out to pink', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(EYEBROW_RED.slice(i, i + 2), 16));
    expect(r!).toBeGreaterThan(g! + 60);
    expect(r!).toBeGreaterThan(b! + 60);
  });
});
