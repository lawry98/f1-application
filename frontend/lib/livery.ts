/**
 * Repainting the shipped F1 car in a team's colour.
 *
 * Pure by design — no `three`, no DOM. The scene code owns the Three.js objects and the canvas;
 * everything that decides *what* gets recoloured and *to what* lives here, where a test can reach
 * it. That split is the point: the defect this replaces was a material filter that matched nothing,
 * and it survived because the only thing that could have caught it was a WebGL frame nobody
 * rendered.
 *
 * ## Why the colour is baked into the texture rather than multiplied over it
 *
 * `MeshStandardMaterial.color` multiplies into `.map`, so the obvious fix — point the existing
 * filter at the `Livery` material and keep setting `.color` — cannot work on this asset. The base
 * texel is `#003572`, and its red channel is **0**: no multiply can put red back. Measured in
 * linear space, Ferrari lands on `#000000`, Audi/Cadillac/McLaren/Aston Martin/Racing Bulls land
 * within a few counts of it, and the remaining five render the same blue, darker. Haas, being
 * white, renders no change at all.
 *
 * ## What counts as bodywork
 *
 * The texture is a flat base colour with decals sitting on top of it, not a painted panel job:
 * 62.9% of it is exactly `#003572`, 30.2% is pure black (floor, wings, underbody), and ~4.3% is
 * FIA/F1 championship branding — every decal pixel having red at full scale.
 *
 * So a texel is bodywork exactly when it is a scalar multiple of the base colour, `k · base` for
 * `k` in `[0, 1.2]`, and the recolour writes `k · teamColour` in its place. Three things fall out
 * of that for free:
 *
 * - the flat base (`k = 1`) becomes the team colour exactly;
 * - black is on the ray at `k = 0`, and `0 × anything` is black, so the car keeps its structure
 *   with no special case;
 * - anti-aliased blue→black edges carry `0 < k < 1` and shade proportionally, so no rim of the
 *   old blue survives around the black regions.
 *
 * Decals are off the ray and are copied through untouched.
 *
 * The three tolerances below are measured, not guessed — see `tests/livery.test.ts`, which
 * re-derives them against the asset in `public/`.
 */

/**
 * The livery texture's flat base colour, and the only place this number lives.
 *
 * Measured from `public/models/f1-car.glb`: 62.9% of the base-colour texture is exactly this
 * value. `tests/livery.test.ts` re-measures it against the shipped file, so re-exporting the model
 * in a different base colour fails there rather than silently leaving the car unrecoloured.
 */
export const LIVERY_BASE_RGB = [0, 53, 114] as const;

/**
 * How much red a texel may carry and still be bodywork.
 *
 * The base colour has none, so in principle this is zero; 93.7% of the texture sits exactly on
 * `r = 0`. The small allowance picks up anti-aliasing where the bodywork meets a decal. Every
 * decal in this texture has `r = 255`, so there is a wide empty margin either side of this.
 */
const MAX_RED = 4;

/** How far off the base-colour ray a texel may sit, in 8-bit counts. On-ray texels measure under 2; decals measure 8 and up. */
const MAX_RESIDUAL = 2;

/** The brightest multiple of the base colour still treated as bodywork. Nothing in the texture exceeds 1.1389. */
const MAX_SCALE = 1.2;

const BASE_G = LIVERY_BASE_RGB[1];
const BASE_B = LIVERY_BASE_RGB[2];
const RAY_LENGTH_SQUARED = BASE_G * BASE_G + BASE_B * BASE_B;

/**
 * Picks the materials whose colour a team livery owns.
 *
 * An exact match against a known name, deliberately: the filter this replaces guessed with
 * `includes('body') || includes('Body') || includes('paint')` and matched none of
 * `Livery`/`RearLight`/`Wheels`/`WheelCovers`. A guess that silently matches nothing is the
 * failure mode, so the names are explicit and a test holds them against the real asset.
 */
export function selectLiveryMaterials<T extends { name?: string }>(materials: readonly T[]): T[] {
  return materials.filter((material) => material.name === 'Livery');
}

/**
 * How strongly a texel carries the livery colour, or `null` if it is not bodywork at all.
 *
 * `0` is a real answer and means black bodywork — distinct from `null`, which means "leave this
 * texel exactly as it is".
 */
export function liveryPaintScale(red: number, green: number, blue: number): number | null {
  if (red > MAX_RED) return null;

  const scale = (green * BASE_G + blue * BASE_B) / RAY_LENGTH_SQUARED;
  if (scale > MAX_SCALE) return null;
  if (Math.abs(green - scale * BASE_G) > MAX_RESIDUAL) return null;
  if (Math.abs(blue - scale * BASE_B) > MAX_RESIDUAL) return null;

  return scale;
}

/**
 * Writes `source` into `target`, repainted in `teamRgb`.
 *
 * `source` must always be the pristine texture. Recolouring in place would multiply each team
 * against the last one's output and drift further from the right colour on every switch.
 */
export function recolourLivery(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  teamRgb: readonly [number, number, number],
): void {
  const [red, green, blue] = teamRgb;

  for (let i = 0; i < source.length; i += 4) {
    const scale = liveryPaintScale(source[i]!, source[i + 1]!, source[i + 2]!);

    if (scale === null) {
      target[i] = source[i]!;
      target[i + 1] = source[i + 1]!;
      target[i + 2] = source[i + 2]!;
    } else {
      target[i] = red * scale;
      target[i + 1] = green * scale;
      target[i + 2] = blue * scale;
    }

    target[i + 3] = source[i + 3]!;
  }
}

/** Parses a `#rrggbb` team colour, with or without the hash. */
export function hexToRgb(hex: string): [number, number, number] {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}
