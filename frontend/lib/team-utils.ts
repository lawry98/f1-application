import { type Team } from '@/data/teams-data';

/** Returns inline style + extra className for a team-color-filled CTA button. */
export function teamColorButtonStyle(team: Team) {
  const isWhite = team.color === '#ffffff';
  return {
    style: {
      backgroundColor: isWhite ? '#27272a' : team.color,
      color: isWhite ? '#ffffff' : team.textOnColor === 'black' ? '#000000' : '#ffffff',
      borderColor: isWhite ? '#52525b' : 'transparent',
    },
    className: isWhite ? 'border' : '',
  };
}

/** The season the page describes. Used to derive elapsed seasons from a debut year. */
const CURRENT_SEASON = 2026;

/** Seasons elapsed since a constructor's debut, for the rail's derived stat cell. */
export function seasonsSince(firstEntry: number): number {
  return CURRENT_SEASON - firstEntry;
}

/** The page background every small text colour on it is judged against — Tailwind `zinc-950`. */
export const DARK_BG = '#09090b';

/** WCAG 2.1 AA for text below 18.66px bold / 24px regular. Team colour is only ever used at 9–10px. */
export const MIN_CONTRAST = 4.5;

function parseHex(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c8) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two opaque hex colours. 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl([r8, g8, b8]: [number, number, number]): [number, number, number] {
  const [r, g, b] = [r8 / 255, g8 / 255, b8 / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const readableCache = new Map<string, string>();

/**
 * A team colour lightened just far enough to clear WCAG AA as small text on `zinc-950`.
 *
 * Seven of the eleven 2026 liveries fail 4.5:1 against the page background — Racing Bulls'
 * `#2b4562` sits at 2.02:1, effectively invisible at 10px. Lightness is raised in HSL, so hue
 * and saturation survive and the result still reads as the brand colour; blending toward white
 * instead would wash the hue out.
 *
 * This is for **small text only**. Bars, accent rules, keylines wider than a hairline and glow
 * blobs are large or decorative, exempt from the AA text rule, and must keep the true colour —
 * a livery wall painted in lightened brand colours is no longer a livery wall.
 */
export function readableOnDark(hex: string): string {
  const cached = readableCache.get(hex);
  if (cached) return cached;

  let result = hex;
  if (contrastRatio(hex, DARK_BG) < MIN_CONTRAST) {
    const [h, s, l] = rgbToHsl(parseHex(hex));
    result = '#ffffff';
    for (let step = l; step <= 1; step += 0.01) {
      const candidate = toHex(hslToRgb(h, s, Math.min(step, 1)));
      if (contrastRatio(candidate, DARK_BG) >= MIN_CONTRAST) {
        result = candidate;
        break;
      }
    }
  }

  readableCache.set(hex, result);
  return result;
}

/**
 * Wash colour for a driver portrait. Mirrors the `#ffffff` special-case that
 * `teamColorButtonStyle` already establishes: a white wash over zinc-950 erases the
 * portrait entirely, so Haas gets a neutral tint and leans on a white keyline instead.
 *
 * `keyline` is the *text* variant — it labels the 10px nationality line, so it is run through
 * `readableOnDark`. The wash (`color`) keeps the true livery: it is a large blended fill, not
 * text, and lightening it would drain the portrait's tint.
 */
export function duotoneFor(team: Team): { color: string; opacity: number; keyline: string } {
  const isWhite = team.color === '#ffffff';
  return {
    color: isWhite ? '#52525b' : team.color,
    opacity: isWhite ? 0.35 : 0.45,
    keyline: isWhite ? '#ffffff' : readableOnDark(team.color),
  };
}
