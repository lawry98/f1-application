/**
 * The tyre's user space, factored out of the drawing code.
 *
 * Every radius the lab draws lives here rather than as a literal in a `<circle>`, because three
 * art directions and half a dozen overlays all have to agree on where the tread band ends and
 * the sidewall begins. A callout leader that points 4 units off is not a rounding error, it is a
 * label pointing at the wrong part.
 *
 * The numbers are inherited from `components/tyres/tyre-visual.tsx` so the two stay visually
 * identical at a glance — that component remains the small supporting illustration, this is the
 * hero engine.
 */

/** Centre of every ring. The canvas is square and the tyre is concentric. */
export const CX = 200;
export const CY = 200;

export const R = {
  /** Outer edge of the rubber. */
  carcass: 196,
  /** Inner edge of the tread band — grooves are cut between here and `carcass`. */
  treadInner: 148,
  /** The coloured compound band. */
  band: 146,
  /** Where the sidewall face starts. */
  sidewall: 138,
  /** Sidewall inner keyline. */
  sidewallInner: 118,
  /** The wheel rim. */
  rim: 106,
  /** Centre lock. */
  hub: 33,
  /** The nut itself. */
  nut: 9,
} as const;

/** A whole-tyre bounding box with room for a glow to breathe. Directions draw into this. */
export const VIEWBOX = { x: 0, y: 0, w: 400, h: 400 } as const;

export type TreadPattern = {
  /** Radial groove count. */
  grooves: number;
  width: number;
  length: number;
  /** Degrees of skew, which is what stops the grooves reading as a gear. */
  skew: number;
  /** Radii of the circumferential drainage channels. */
  channels: readonly number[];
};

/**
 * The two cut patterns. `slick` is deliberately absent rather than an empty pattern — a slick is
 * not a tyre with zero grooves, it is a tyre with no groove geometry at all, and the call sites
 * branch on `null` so nothing iterates an empty array 20 times per frame.
 */
export const TREAD_PATTERN: Record<'intermediate' | 'wet', TreadPattern> = {
  intermediate: { grooves: 20, width: 5.5, length: 36, skew: 11, channels: [166] },
  wet: { grooves: 16, width: 9, length: 50, skew: 16, channels: [172, 156] },
};

/**
 * Wear is a scalar because every surface it touches moves together.
 *
 * At 0 the tyre is out of the blankets; at 1 it is at the end of a long stint. Grooves shorten
 * and narrow (they are moulded to a depth, so wearing the tread down eats them from the top),
 * the surface loses gloss, and the shoulder picks up scuffing. Returning the whole set from one
 * function keeps those in step — the bug this prevents is a tyre with pristine grooves and a
 * scuffed shoulder, which reads as a rendering fault rather than as wear.
 */
export function wearGeometry(pattern: TreadPattern, wear: number) {
  const w = clamp01(wear);
  return {
    /** Grooves are moulded to a depth: wear eats them from the outside in. */
    length: pattern.length * (1 - 0.55 * w),
    width: pattern.width * (1 - 0.35 * w),
    /** Channels shallow out the same way, expressed as stroke weight. */
    channelScale: 1 - 0.5 * w,
    /** A worn tyre is duller, not shinier — this multiplies the gloss layer. */
    sheen: 1 - 0.65 * w,
    /** How strongly the scuff/graining texture reads. */
    scuff: w,
  };
}

/** Surface temperature states, and what each does to the thermal overlay. */
export const THERMAL = {
  cold: { core: '#2b6fe0', mid: '#2f8f8f', edge: '#123', intensity: 0.35, label: 'Below window' },
  optimal: { core: '#ffd12e', mid: '#e8862f', edge: '#3a1d05', intensity: 0.5, label: 'In window' },
  hot: { core: '#fff2d0', mid: '#e8382f', edge: '#4a0c06', intensity: 0.72, label: 'Overheating' },
} as const;

export type ThermalState = keyof typeof THERMAL;

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * A point on a circle, in the SVG's y-down space.
 *
 * `deg` is measured clockwise from twelve o'clock, which is how the annotations are specified
 * ("the callout at two o'clock") and is *not* what `Math.cos/sin` do — hence the -90 turn and the
 * order of the two components. Getting this wrong mirrors every leader line about the diagonal,
 * which looks like a layout bug rather than an angle bug.
 */
export function polar(deg: number, radius: number, cx: number = CX, cy: number = CY) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}
