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
const SAMPLES_PER_RING = 26;

/**
 * Five peaks per tile, positioned and sized to stay **entirely inside** the tile.
 *
 * Containment is not cosmetic: a pattern tile clips its contents, so any ring crossing an edge
 * would be sliced flat and the seams would show up as a grid of straight cuts. The wobble can
 * reach 1.26× a ring's nominal radius (the three sine amplitudes sum to 0.26), so the margins
 * here are sized against that worst case, and a test asserts every coordinate lands in
 * [0, TILE].
 *
 * Coordinates and radii are fractions of the tile so the geometry survives a change to TILE.
 */
const PEAKS = [
  { cx: 0.18, cy: 0.22, rings: 6, base: 0.016, step: 0.013, stretch: 1.25 },
  { cx: 0.52, cy: 0.62, rings: 7, base: 0.014, step: 0.011, stretch: 1.15 },
  { cx: 0.82, cy: 0.16, rings: 5, base: 0.013, step: 0.012, stretch: 1.4 },
  { cx: 0.3, cy: 0.84, rings: 4, base: 0.012, step: 0.01, stretch: 1.3 },
  { cx: 0.88, cy: 0.74, rings: 5, base: 0.011, step: 0.011, stretch: 1.2 },
];

/**
 * The wobble is a sum of three sines rather than randomness, so the markup is byte-identical on
 * the server and the client; a `Math.random()` here would be a hydration mismatch on every page
 * carrying the texture. Each ring takes its own phase, so rings drift out of step the way real
 * contours do instead of nesting as concentric blobs.
 */
function buildRings(): { id: string; d: string }[] {
  return PEAKS.flatMap((peak, p) =>
    Array.from({ length: peak.rings }, (_, ring) => {
      const radius = TILE * (peak.base + ring * peak.step);
      const phase = p * 0.9 + ring * 1.37;

      const points: Point[] = Array.from({ length: SAMPLES_PER_RING }, (_, i) => {
        const t = (i / SAMPLES_PER_RING) * Math.PI * 2;
        const wobble =
          1 +
          0.13 * Math.sin(3 * t + phase) +
          0.08 * Math.sin(5 * t - phase * 1.6) +
          0.05 * Math.sin(7 * t + phase * 0.4);
        const r = radius * wobble;
        // Rings drift as they widen, so a peak's centre sits off-centre from its outer rings.
        return [
          peak.cx * TILE + Math.cos(t) * r * peak.stretch + ring * 3,
          peak.cy * TILE + Math.sin(t) * r + ring * 2,
        ];
      });

      return { id: `peak-${p}-ring-${ring}`, d: catmullRomPath(points, true) };
    }),
  );
}

const RINGS = buildRings();

interface TopoBackgroundProps {
  className?: string;
}

/**
 * Topographic contour texture.
 *
 * **Tiled at a fixed pixel size, never scaled to fit.** An earlier version set a `viewBox` with
 * `preserveAspectRatio="xMidYMid slice"`, which makes the scale `max(containerW / fieldW,
 * containerH / fieldH)` — a function of the container's size. On `/briefing` that was measured
 * as 1.5 for the 1440×702 empty state but 6.61 once a streamed briefing made it 1440×3171,
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
            {RINGS.map(({ id: ringId, d }) => (
              <path key={ringId} d={d} />
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
