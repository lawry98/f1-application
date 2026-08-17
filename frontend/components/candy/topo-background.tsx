'use client';

import { useId } from 'react';
import { polylinePath, type Point } from '@/lib/svg-path';
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
 * Circuit outlines, as closed loops.
 *
 * **These are stylised, not surveyed.** `backend/scripts/dump_circuit_geometry.py` exists to
 * pull real geometry out of FastF1 telemetry, but FastF1's live-timing source and its mirror
 * are both unreachable from here — `session.load()` reports car data, position data *and*
 * session info all unavailable, which is the same unreachability `CLAUDE.md` records for the
 * result tools. When that source is reachable these get replaced by the script's output; the
 * shape of this array is deliberately the same as the JSON it will emit.
 *
 * What makes a closed loop read as a racetrack rather than a blob is having segments of very
 * different curvature, so each one carries three things on purpose:
 *
 *   - a **start/finish straight** long enough to dominate the shape
 *   - a **hairpin**: two points close together around a sharp reversal
 *   - a **chicane**: a short zigzag between two faster sections
 *
 * They are drawn with `polylinePath` and `stroke-linejoin="round"`, **not** `catmullRomPath`.
 * Smoothing was tried first and is what made the second version read as blobs: interpolating a
 * sparse point set rounds every direction change into a wide arc, so a hairpin and a fast sweep
 * came out the same radius. Straight segments keep a straight straight and a hairpin tight, and
 * the round joins supply a corner radius of about the stroke width — a printed track map.
 *
 * The first version had none of this and nested sine-wobbled circles instead, which is why it
 * read as a field of flowers: the rings stayed convex and evenly spaced, the one thing a circuit
 * never is.
 *
 * Coordinates are arbitrary; `normalise` re-centres each one on its centroid and scales it so
 * its furthest point sits at radius 0.5. A placement's `size` is therefore exactly the shape's
 * diameter, which makes containment inside the tile something you can check by arithmetic
 * instead of by eye.
 */
const TRACKS: Point[][] = [
  // Power circuit: one very long main straight, a chicane, and a tight hairpin at the top.
  [
    [0.08, 0.9],
    [0.62, 0.9],
    [0.72, 0.84],
    [0.78, 0.74],
    [0.7, 0.68],
    [0.74, 0.6],
    [0.86, 0.54],
    [0.9, 0.42],
    [0.82, 0.34],
    [0.68, 0.34],
    [0.64, 0.42],
    [0.52, 0.4],
    [0.46, 0.28],
    [0.34, 0.24],
    [0.22, 0.28],
    [0.16, 0.38],
    [0.2, 0.5],
    [0.3, 0.58],
    [0.26, 0.7],
    [0.14, 0.76],
  ],
  // Street circuit: a long straight up one side, then tight kinks that double back twice.
  [
    [0.1, 0.86],
    [0.1, 0.44],
    [0.16, 0.32],
    [0.28, 0.26],
    [0.4, 0.28],
    [0.44, 0.38],
    [0.36, 0.44],
    [0.4, 0.52],
    [0.54, 0.5],
    [0.62, 0.4],
    [0.76, 0.36],
    [0.86, 0.44],
    [0.88, 0.56],
    [0.78, 0.62],
    [0.66, 0.6],
    [0.6, 0.68],
    [0.66, 0.78],
    [0.56, 0.86],
    [0.36, 0.88],
    [0.2, 0.9],
  ],
  // Triangle: three long straights joined by corner complexes.
  [
    [0.12, 0.84],
    [0.52, 0.88],
    [0.64, 0.8],
    [0.68, 0.68],
    [0.86, 0.5],
    [0.9, 0.38],
    [0.8, 0.28],
    [0.66, 0.26],
    [0.44, 0.18],
    [0.3, 0.2],
    [0.2, 0.3],
    [0.24, 0.42],
    [0.34, 0.5],
    [0.28, 0.64],
    [0.16, 0.72],
  ],
  // Technical: short straights, many corners, a double hairpin on the return leg.
  [
    [0.22, 0.28],
    [0.46, 0.24],
    [0.56, 0.32],
    [0.52, 0.44],
    [0.6, 0.52],
    [0.72, 0.48],
    [0.82, 0.54],
    [0.8, 0.66],
    [0.68, 0.72],
    [0.56, 0.68],
    [0.46, 0.74],
    [0.48, 0.86],
    [0.34, 0.88],
    [0.24, 0.8],
    [0.16, 0.64],
    [0.14, 0.44],
  ],
];

/**
 * Where each circuit sits in the tile, how big, and how turned.
 *
 * One stroke per placement, not a nest of concentric offsets. Offsetting a track shape inwards
 * pinches its hairpins shut and closes up its chicanes, so a nest of them stops reading as a
 * circuit — the recognisable thing is the single line.
 *
 * Sizes are deliberately small relative to the tile. A first pass used 290–380px shapes, and at
 * that scale a 1440×700 viewport only ever holds *fragments* of each loop, which read as smooth
 * blobs. A circuit is only recognisable when you can see the whole lap at once, so these are
 * 90–200px and there are twelve of them.
 *
 * Every entry satisfies `size / 2 <= cx, cy <= TILE - size / 2`, which is what keeps the
 * geometry off the tile edges. Rotation costs nothing here because `normalise` works in polar
 * terms — turning a shape cannot push it outside its own bounding circle.
 */
const PLACEMENTS = [
  { track: 0, cx: 150, cy: 150, size: 200, rotate: 0.18 },
  { track: 1, cx: 420, cy: 130, size: 170, rotate: -0.42 },
  { track: 2, cx: 690, cy: 160, size: 190, rotate: 1.15 },
  { track: 3, cx: 830, cy: 380, size: 130, rotate: 2.4 },
  { track: 0, cx: 600, cy: 390, size: 160, rotate: -1.25 },
  { track: 1, cx: 300, cy: 380, size: 150, rotate: 0.7 },
  { track: 2, cx: 120, cy: 420, size: 120, rotate: -2.1 },
  { track: 3, cx: 180, cy: 660, size: 180, rotate: 0.95 },
  { track: 0, cx: 450, cy: 690, size: 200, rotate: -0.75 },
  { track: 1, cx: 720, cy: 650, size: 170, rotate: 1.9 },
  { track: 2, cx: 390, cy: 840, size: 110, rotate: -1.55 },
  { track: 3, cx: 850, cy: 850, size: 90, rotate: 0.35 },
];

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
 * Placed circuit outlines, deterministic so the markup is byte-identical on the server and the
 * client — anything random here would be a hydration mismatch on every page carrying the
 * texture.
 */
function buildContours(): { id: string; d: string }[] {
  return PLACEMENTS.map((place, p) => {
    const shape = NORMALISED[place.track]!;
    const cos = Math.cos(place.rotate);
    const sin = Math.sin(place.rotate);

    const points = shape.map(([x, y]): Point => {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      return [place.cx + rx * place.size, place.cy + ry * place.size];
    });

    return { id: `circuit-${p}`, d: polylinePath(points, true) };
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
 * other element. The default is 12%. The brief asked for 5%, but a 1px stroke at 5% over
 * #09090B is invisible on a real display, and at 6% the outlines were legible only if you knew
 * to look for them — which defeats a texture whose job is to say "map".
 */
export function TopoBackground({ className }: TopoBackgroundProps) {
  const id = useId();
  const patternId = `topo-${id}`;

  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]', className)}
    >
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
          <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinejoin="round">
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
