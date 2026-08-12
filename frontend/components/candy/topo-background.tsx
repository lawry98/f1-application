import { catmullRomPath, type Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

/**
 * A 2:1 field, not a square one. The texture is `slice`-cropped to cover its container, and
 * containers here are section-shaped — a square viewBox scaled into a 1440×380 band showed a
 * horizontal sliver of the design, which read as three big arcs rather than as contour lines.
 */
const FIELD_W = 960;
const FIELD_H = 480;
const SAMPLES_PER_RING = 26;

/**
 * Three peaks of nested contour rings, spread across the field.
 *
 * One peak is not enough at section width: whichever part of it survives the crop is a couple
 * of near-parallel curves. Three peaks at different scales keep contour *lines* on screen at
 * any crop, and a small container lands on a fragment of the map — which is what a map crop
 * looks like anyway.
 *
 * The wobble is a sum of three sines rather than randomness so the markup is byte-identical on
 * the server and the client; a `Math.random()` here would be a hydration mismatch on every
 * page carrying the texture. Each ring takes its own phase, so rings drift out of step the way
 * real contours do instead of nesting as concentric blobs.
 */
const PEAKS = [
  { cx: 0.17, cy: 0.34, rings: 7, base: 0.05, step: 0.037, stretch: 1.3 },
  { cx: 0.58, cy: 0.72, rings: 8, base: 0.04, step: 0.032, stretch: 1.15 },
  { cx: 0.87, cy: 0.22, rings: 6, base: 0.045, step: 0.041, stretch: 1.45 },
];

function buildRings(): { id: string; d: string }[] {
  return PEAKS.flatMap((peak, p) =>
    Array.from({ length: peak.rings }, (_, ring) => {
      const radius = FIELD_H * (peak.base + ring * peak.step);
      const phase = p * 0.9 + ring * 1.37;

      const points: Point[] = Array.from({ length: SAMPLES_PER_RING }, (_, i) => {
        const t = (i / SAMPLES_PER_RING) * Math.PI * 2;
        const wobble =
          1 +
          0.13 * Math.sin(3 * t + phase) +
          0.08 * Math.sin(5 * t - phase * 1.6) +
          0.05 * Math.sin(7 * t + phase * 0.4);
        const r = radius * wobble;
        // Rings drift as they widen, so each peak's centre is off-centre from its outer rings.
        return [
          peak.cx * FIELD_W + Math.cos(t) * r * peak.stretch + ring * 4,
          peak.cy * FIELD_H + Math.sin(t) * r + ring * 3,
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
 * Topographic contour texture. Server component — it renders the same markup every time and
 * has no interactivity, so there is no reason to ship it to the client.
 *
 * Absolutely positioned and `pointer-events-none`, so dropping it into a container never
 * moves anything. Strokes are `currentColor`; set the colour and the opacity from the call
 * site (`className="text-ink/20 opacity-[0.05]"`) rather than from a prop, so it composes
 * like any other element.
 */
export function TopoBackground({ className }: TopoBackgroundProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
      // `slice` keeps the contours circular instead of stretching them to the container's
      // aspect ratio, which is the difference between a texture and a smear.
      preserveAspectRatio="xMidYMid slice"
      className={cn('pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1}>
        {RINGS.map(({ id, d }) => (
          <path key={id} d={d} />
        ))}
      </g>
    </svg>
  );
}
