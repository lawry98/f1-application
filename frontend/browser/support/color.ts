/**
 * Colour arithmetic for the browser harness. Pure, so it runs without a page.
 *
 * Deliberately **not** imported from `lib/team-utils.ts`: the harness checks the page against
 * WCAG, and a check built from the helpers it is checking would agree with them by construction.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rgba extends Rgb {
  a: number;
}

const RGB_FUNCTION = /^rgba?\(\s*([^)]+)\)$/i;

/**
 * Parses what Chromium hands back from `getComputedStyle`: legacy `rgb(1, 2, 3)` /
 * `rgba(1, 2, 3, 0.5)` for real properties, and modern `rgb(1 2 3 / 0.5)` for custom properties
 * such as `--tw-ring-color`, which keep their authored syntax.
 */
export function parseCssColor(value: string): Rgba {
  const body = RGB_FUNCTION.exec(value.trim())?.[1];
  if (body === undefined) throw new Error(`parseCssColor: not an rgb() colour: "${value}"`);
  const [r, g, b, a] = body.split(/[\s,/]+/).filter(Boolean);
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`parseCssColor: expected three channels in "${value}"`);
  }
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number.parseFloat(a) / 100 : Number(a);
  return { r: Number(r), g: Number(g), b: Number(b), a: alpha };
}

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio, order-independent, in `[1, 21]`. */
export function wcagRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over compositing of `top` onto an opaque `bottom`, in sRGB as browsers paint it. */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

/** Chromium's computed serialisation, so harness output can be compared to `getComputedStyle`. */
export function formatCssColor(c: Rgb | Rgba): string {
  const [r, g, b] = [c.r, c.g, c.b].map(Math.round);
  const a = 'a' in c ? c.a : 1;
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}
