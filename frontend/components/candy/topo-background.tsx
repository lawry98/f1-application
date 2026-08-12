'use client';

import { useId } from 'react';
import { catmullRomPath, type Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

/**
 * Tile edge, in CSS pixels.
 *
 * The SVG deliberately carries **no `viewBox`**, so one user unit is one CSS pixel and the
 * contours are drawn at a fixed size no matter how large their container gets. This is the
 * whole point of the component's shape — see the note on `TopoBackground` below.
 *
 * 900 is chosen so the repeat is not legible. At 560 a 1440px page showed the tile two and a
 * half times over and the eye immediately picked out one motif on a grid; at 900 it repeats
 * 1.6 times across and reads as terrain.
 */
const TILE = 900;

/**
 * Stylised circuit outlines, as closed loops.
 *
 * These replace the concentric wobbly circles this component started with. Nesting a sine-
 * wobbled circle inside itself reads unavoidably as a flower — the rings stay convex and
 * evenly spaced, which is the one thing a racetrack never is. A circuit has long straights,
 * a hairpin, and a chicane, so its outline has segments of very different curvature, and
 * *that* is what makes an offset outline read as a track rather than a petal.
 *
 * Coordinates are arbitrary; `normalise` re-centres each one on its centroid and scales it so
 * its furthest point sits at radius 0.5. A placement's `size` is therefore exactly the shape's
 * diameter, which makes containment inside the tile something you can check by arithmetic
 * instead of by eye.
 */
const TRACKS: Point[][] = [
  // Long main straight into a fast right, then a lobe of medium corners. Monza-ish.
  [
    [0.05, 0.55],
    [0.1, 0.25],
    [0.2, 0.12],
    [0.38, 0.1],
    [0.5, 0.18],
    [0.55, 0.32],
    [0.68, 0.36],
    [0.8, 0.3],
    [0.92, 0.36],
    [0.95, 0.52],
    [0.86, 0.62],
    [0.7, 0.6],
    [0.55, 0.66],
    [0.42, 0.8],
    [0.26, 0.86],
    [0.12, 0.78],
  ],
  // Tight, kinked, doubling back on itself. Street-circuit character.
  [
    [0.08, 0.3],
    [0.22, 0.14],
    [0.4, 0.12],
    [0.52, 0.22],
    [0.48, 0.38],
    [0.6, 0.46],
    [0.78, 0.4],
    [0.9, 0.5],
    [0.84, 0.66],
    [0.66, 0.7],
    [0.52, 0.62],
    [0.38, 0.68],
    [0.3, 0.82],
    [0.14, 0.76],
    [0.06, 0.56],
  ],
  // Flowing, with one hairpin pinching the top right.
  [
    [0.1, 0.46],
    [0.16, 0.22],
    [0.34, 0.1],
    [0.56, 0.14],
    [0.62, 0.3],
    [0.74, 0.22],
    [0.9, 0.32],
    [0.88, 0.54],
    [0.72, 0.64],
    [0.58, 0.56],
    [0.44, 0.62],
    [0.34, 0.78],
    [0.18, 0.72],
  ],
];

/**
 * Where each circuit sits in the tile, how big, how turned, and how many nested outlines.
 *
 * Every entry satisfies `size / 2 <= cx, cy <= TILE - size / 2`, which is what keeps the
 * geometry off the tile edges. Rotation costs nothing here because `normalise` works in polar
 * terms — turning a shape cannot push it outside its own bounding circle.
 */
const PLACEMENTS = [
  { track: 0, cx: 215, cy: 215, size: 360, rotate: 0.2, rings: 4 },
  { track: 1, cx: 625, cy: 635, size: 330, rotate: -0.4, rings: 4 },
  { track: 2, cx: 730, cy: 190, size: 300, rotate: 1.1, rings: 3 },
  { track: 0, cx: 300, cy: 770, size: 230, rotate: 2.4, rings: 3 },
  { track: 1, cx: 140, cy: 545, size: 220, rotate: -1.2, rings: 3 },
];

/** Successive outlines step inwards by this much, as a fraction of the outermost. */
const RING_STEP = 0.19;

/** Re-centre on the centroid and scale so the furthest point sits at radius 0.5. */
function normalise(track: Point[]): Point[] {
  const cx = track.reduce((sum, [x]) => sum + x, 0) / track.length;
  const cy = track.reduce((sum, [, y]) => sum + y, 0) / track.length;
  const centred = track.map(([x, y]): Point => [x - cx, y - cy]);
  const reach = Math.max(...centred.map(([x, y]) => Math.hypot(x, y)));
  return centred.map(([x, y]): Point => [(x / reach) * 0.5, (y / reach) * 0.5]);
}

const NORMALISED = TRACKS.map(normalise);

/**
 * Nested circuit outlines, deterministic so the markup is byte-identical on the server and the
 * client — anything random here would be a hydration mismatch on every page carrying the
 * texture.
 */
function buildContours(): { id: string; d: string }[] {
  return PLACEMENTS.flatMap((place, p) => {
    const shape = NORMALISED[place.track]!;
    const cos = Math.cos(place.rotate);
    const sin = Math.sin(place.rotate);

    return Array.from({ length: place.rings }, (_, ring) => {
      const scale = place.size * (1 - ring * RING_STEP);
      // Inner outlines drift slightly off-centre, the way contours do on a real slope, so the
      // nest does not read as a set of perfectly coaxial copies.
      const driftX = ring * 4;
      const driftY = ring * 3;

      const points = shape.map(([x, y]): Point => {
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        return [place.cx + rx * scale + driftX, place.cy + ry * scale + driftY];
      });

      return { id: `circuit-${p}-ring-${ring}`, d: catmullRomPath(points, true) };
    });
  });
}

const CONTOURS = buildContours();

interface TopoBackgroundProps {
  className?: string;
}

/**
 * Contour texture built from stylised circuit outlines.
 *
 * **Tiled at a fixed pixel size, never scaled to fit.** An earlier version set a `viewBox` with
 * `preserveAspectRatio="xMidYMid slice"`, which makes the scale `max(containerW / fieldW,
 * containerH / fieldH)` — a function of the container's size. On `/briefing` that was measured
 * as 1.5 for the 1440×702 empty state but 6.61 once a streamed briefing made it 1440×3251,
 * leaving 218 of 960 field units on screen. The texture magnified on every streamed chunk and
 * finished as a handful of huge strokes. Repeating a fixed tile instead means a taller container
 * reveals more contours rather than bigger ones, so nothing moves while content streams in.
 *
 * `useId` follows `components/ui/dot-pattern.tsx`: several of these can sit on one page, and a
 * hard-coded pattern id would make every instance resolve to the first one's definition.
 *
 * Absolutely positioned and `pointer-events-none`, so dropping it into a container never moves
 * anything. Strokes are `currentColor`; set colour and opacity from the call site
 * (`className="text-ink opacity-[0.04]"`) rather than through props, so it composes like any
 * other element. The default is 6% — the brief asked for 5%, and a 1px stroke at 5% over
 * #09090B does not survive contact with a real display.
 */
export function TopoBackground({ className }: TopoBackgroundProps) {
  const id = useId();
  const patternId = `topo-${id}`;

  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]', className)}
    >
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
          <g fill="none" stroke="currentColor" strokeWidth={1}>
            {CONTOURS.map(({ id: ringId, d }) => (
              <path key={ringId} d={d} />
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
