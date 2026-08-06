import { type Team } from '@/data/teams-data';

/**
 * Contrast-safe helpers for the runtime team colors.
 *
 * Team colors are brand assets, not UI tokens: `#2b4562` (Racing Bulls) reads at 1.9:1 on the
 * page background and `#ffffff` (Haas) reads at 1:1 against white button text. Every consumer
 * used to special-case white by hand; these helpers derive the safe variant instead, while
 * `palette.base` keeps the untouched brand color for decorative use (glows, 3D livery, bars).
 */

/** The page background every team color is judged against (`bg-zinc-950`). */
export const PAGE_BG = '#09090b';

/** WCAG AA for body text. */
const AA_TEXT = 4.5;
/** WCAG AA for large (>=24px, or >=18.66px bold) text and UI boundaries. */
const AA_LARGE = 3;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `#rrggbb` plus an alpha channel, as an `rgb()` string usable in any inline style. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/**
 * The nearest lightness-shifted variant of `color` that clears `minRatio` against `bg`.
 *
 * Hue and saturation are preserved, so the result still reads as the team's color — Ferrari red
 * stays red, it just stops being unreadable. Shifts away from the background (lighter on a dark
 * page, darker on a light one) and falls back to plain white/black if even the extreme fails.
 */
export function readableOn(
  color: string,
  bg: string = PAGE_BG,
  minRatio: number = AA_TEXT,
): string {
  if (contrastRatio(color, bg) >= minRatio) return color;

  const [h, s, l] = rgbToHsl(parseHex(color));
  const towardsLight = relativeLuminance(bg) < 0.5;
  const step = towardsLight ? 0.02 : -0.02;

  for (let next = l + step; next >= 0 && next <= 1; next += step) {
    const candidate = toHex(hslToRgb([h, s, next]));
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
  }
  return towardsLight ? '#ffffff' : '#000000';
}

/** Black or white — whichever is more readable on top of a solid `color` fill. */
export function bestTextOn(color: string): '#000000' | '#ffffff' {
  return contrastRatio(color, '#000000') >= contrastRatio(color, '#ffffff') ? '#000000' : '#ffffff';
}

export interface TeamPalette {
  /** The untouched brand color. Decorative use only: glows, 3D livery, bars, chart fills. */
  base: string;
  /** Brand hue shifted to clear 4.5:1 on the page background. Safe for labels and small text. */
  text: string;
  /** Brand hue shifted to clear 3:1. Safe for large/bold display text, borders, focus rings. */
  display: string;
  /** Black or white, for text sitting on a solid `base` fill. */
  on: string;
  /** Solid-enough border that survives against the page background. */
  border: string;
  /** Tinted surface for chips and panels. */
  surface: string;
  /** Stronger tint for hover and active surfaces. */
  surfaceStrong: string;
  /** Focus ring color — same as `display`, so it clears 3:1 for every team. */
  ring: string;
}

const paletteCache = new Map<string, TeamPalette>();

/** Memoized contrast-safe palette derived from a raw team color. */
export function paletteFor(color: string): TeamPalette {
  const cached = paletteCache.get(color);
  if (cached) return cached;

  const display = readableOn(color, PAGE_BG, AA_LARGE);
  const palette: TeamPalette = {
    base: color,
    text: readableOn(color, PAGE_BG, AA_TEXT),
    display,
    on: bestTextOn(color),
    border: withAlpha(display, 0.55),
    surface: withAlpha(color, 0.12),
    surfaceStrong: withAlpha(color, 0.22),
    ring: display,
  };
  paletteCache.set(color, palette);
  return palette;
}

/** Inline style for a CTA filled with the team color, with a guaranteed-readable label. */
export function teamColorButtonStyle(team: Team) {
  const palette = paletteFor(team.color);
  return {
    style: {
      backgroundColor: palette.base,
      color: palette.on,
      borderColor: 'transparent',
    },
  };
}
