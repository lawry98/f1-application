import { expect, test } from '@playwright/test';

import { composite, formatCssColor, parseCssColor, wcagRatio } from './color';

test.describe('color', () => {
  test('parses legacy, modern and percentage-alpha rgb()', () => {
    expect(parseCssColor('rgb(225, 6, 0)')).toEqual({ r: 225, g: 6, b: 0, a: 1 });
    expect(parseCssColor('rgba(59, 130, 246, 0.5)')).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
    // What `getPropertyValue('--tw-ring-color')` returns once `var(--tw-ring-opacity, 1)` resolves.
    expect(parseCssColor('rgb(244 244 237 / 1)')).toEqual({ r: 244, g: 244, b: 237, a: 1 });
    expect(parseCssColor('rgb(59 130 246 / 50%)')).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
    expect(() => parseCssColor('oklch(0.5 0.1 20)')).toThrow(/not an rgb/);
  });

  test('computes WCAG 2 contrast ratios', () => {
    expect(wcagRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5);
    expect(wcagRatio({ r: 0x76, g: 0x76, b: 0x76 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(4.54, 2);
    // lib/focus.ts: "f1-red against base #09090B — 4.01".
    expect(wcagRatio({ r: 225, g: 6, b: 0 }, { r: 9, g: 9, b: 11 })).toBeCloseTo(4.01, 2);
    // Order-independent.
    expect(wcagRatio({ r: 9, g: 9, b: 11 }, { r: 225, g: 6, b: 0 })).toBeCloseTo(4.01, 2);
  });

  test('composites a translucent layer the way the rail row is painted', () => {
    // lib/focus.ts: bg-zinc-800/60 over the page composites to #1b1b1e, not to zinc-800.
    const zinc800at60 = { r: 39, g: 39, b: 42, a: 0.6 };
    expect(formatCssColor(composite(zinc800at60, { r: 9, g: 9, b: 11 }))).toBe('rgb(27, 27, 30)');
  });

  test('formats like Chromium serialises computed colours', () => {
    expect(formatCssColor({ r: 225, g: 6, b: 0 })).toBe('rgb(225, 6, 0)');
    expect(formatCssColor({ r: 59, g: 130, b: 246, a: 0.5 })).toBe('rgba(59, 130, 246, 0.5)');
  });
});
