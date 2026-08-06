import { describe, expect, it } from 'vitest';

import { TEAMS } from '@/data/teams-data';
import {
  PAGE_BG,
  bestTextOn,
  contrastRatio,
  paletteFor,
  readableOn,
  withAlpha,
} from '@/lib/team-utils';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a color on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#dc0000', '#dc0000')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#2b4562', PAGE_BG)).toBeCloseTo(contrastRatio(PAGE_BG, '#2b4562'), 10);
  });
});

describe('readableOn', () => {
  it('leaves a color alone when it already clears the target', () => {
    expect(readableOn('#ffffff', PAGE_BG, 4.5)).toBe('#ffffff');
  });

  it('lifts a color that does not', () => {
    // Racing Bulls navy reads at ~1.9:1 on the page background.
    expect(contrastRatio('#2b4562', PAGE_BG)).toBeLessThan(4.5);
    expect(contrastRatio(readableOn('#2b4562', PAGE_BG, 4.5), PAGE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue while lifting', () => {
    const lifted = readableOn('#dc0000', PAGE_BG, 4.5);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(lifted.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g!);
    expect(r).toBeGreaterThan(b!);
  });
});

describe('bestTextOn', () => {
  it('picks the higher-contrast of black and white', () => {
    expect(bestTextOn('#ffffff')).toBe('#000000');
    expect(bestTextOn('#1e41ff')).toBe('#ffffff');
  });
});

describe('withAlpha', () => {
  it('renders an alpha-composited color channel string', () => {
    expect(withAlpha('#00d2be', 0.5)).toBe('rgb(0 210 190 / 0.5)');
  });
});

describe('paletteFor, for every team on the grid', () => {
  it.each(TEAMS.map((team) => [team.shortName, team.color] as const))(
    '%s keeps text, display, and fill readable',
    (_name, color) => {
      const palette = paletteFor(color);

      expect(contrastRatio(palette.text, PAGE_BG)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.display, PAGE_BG)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.ring, PAGE_BG)).toBeGreaterThanOrEqual(3);
      // Text sitting on a solid fill of the brand color.
      expect(contrastRatio(palette.on, color)).toBeGreaterThanOrEqual(4.5);
      // The brand color itself is never rewritten — decorative use must stay on-brand.
      expect(palette.base).toBe(color);
    },
  );

  it('memoizes by color', () => {
    expect(paletteFor('#dc0000')).toBe(paletteFor('#dc0000'));
  });
});
