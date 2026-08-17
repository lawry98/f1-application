'use client';

import { useId, useMemo } from 'react';
import { motion, useReducedMotion, type MotionProps, type Variants } from 'motion/react';
import { catmullRomPath, type Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

/**
 * The user space every number in this file is expressed in.
 *
 * Points arrive normalised 0–1, and **that is not a usable space to draw strokes in**: in a
 * `viewBox="0 0 1 1"` the spec's `stroke-width: 14` is fourteen times the whole picture, and
 * `1.5` is still 150% of it. So the points are scaled up into a 500-unit square and the spec's
 * widths (14 / 5 / 1.5) are kept verbatim in *those* units.
 *
 * 500 is chosen so that at a 500px-wide render one user unit is exactly one CSS pixel and every
 * number the spec gives — 14px halo, 5px line, 1.5px core, 3px dot, 24px leader, 10px number —
 * is literally its pixel value. Above and below that size everything scales together, which is
 * the point: the 14 : 5 : 1.5 ratio is what makes the glow read as a glow around a line rather
 * than as three separate lines, and a ratio survives scaling.
 *
 * The rejected alternative was `vector-effect="non-scaling-stroke"`, which pins stroke width to
 * device pixels no matter the render size. That breaks both ends of the range this component has
 * to cover: the same 5px line would sit on a 120px ticket-card outline (where it swallows the
 * shape) and on a 900px hero map (where it reads as a hairline), and the 14px halo would drown
 * the small one entirely.
 */
const VIEW = 500;

/**
 * Inset, in user units, between the 0–1 point space and the edge of the viewBox.
 *
 * Two things have to fit in this margin, and it is sized for the larger:
 *
 *   - the halo. Half of the 14-unit glow stroke (7) plus 3σ of a 10-unit Gaussian (30) = 37
 *     units of paint outside the outermost point. Less than that and the halo is cut off square
 *     by the SVG viewport, which is the one artefact that makes a glow look broken.
 *   - a corner marker. 24-unit leader + 8-unit gap + roughly 14 units of two-digit number = 46.
 *
 * Hence 48. It costs ~19% of the box as margin, which a track map wants anyway — the shape needs
 * air, and the corner numbers live in exactly that air.
 *
 * The arithmetic assumes the drawn curve stays near the hull of the points, which is true for the
 * input this takes: Catmull-Rom's control points sit a sixth of the neighbour-to-neighbour vector
 * out, so on a densely sampled outline the overshoot is a fraction of the sample spacing. A
 * deliberately sparse shape is a different story — a four-point square overshoots by ~67 units,
 * far more than PAD — which is one more reason this component is fed sampled geometry and not a
 * schematic.
 *
 * Note what is *not* done here: the points are not re-fitted to their own bounding box. The
 * loader owns normalisation, so re-fitting would either duplicate it or fight it, and a per-axis
 * fit would stretch a tall circuit (Monaco) to fill a square. A single linear transform applied
 * to both axes cannot introduce distortion whatever the input aspect is.
 */
const PAD = 48;
const SPAN = VIEW - PAD * 2;

/** The three-layer stroke stack, verbatim from the spec, in VIEW units. */
const GLOW_WIDTH = 14;
const LINE_WIDTH = 5;
const CORE_WIDTH = 1.5;
const GLOW_OPACITY = 0.25;
const LINE_OPACITY = 0.9;
const BLUR_STD = 10;

/**
 * The core highlight. `#FFF3` is the spec's value — four-digit hex, i.e. white at 20% alpha.
 * It stays a literal rather than a token because it is not a palette colour: it is the specular
 * line down the middle of a lit stroke, and it has to be white regardless of the stroke's hue.
 */
const CORE_COLOUR = '#FFF3';

/**
 * The `plain` variant's single stroke, wider than the glow variant's 5-unit line on purpose.
 *
 * This variant exists for the ~120px outline inside a ticket card, where the viewBox scale is
 * 120 / 500 = 0.24. At that scale 5 units lands at 1.2 device pixels and 2 units at 0.48 — a
 * stroke that thin either antialiases away to nothing or shimmers. 6 units gives ~1.4px at
 * ticket size and ~6px at 1:1, which is solid small and still slim enough not to close up a
 * hairpin.
 */
const PLAIN_WIDTH = 6;

/** Corner marker geometry, in VIEW units. */
const DOT_RADIUS = 3;
const LEADER_LENGTH = 24;
const LEADER_WIDTH = 1;
const NUMBER_SIZE = 10;
const NUMBER_GAP = 8;

/** Spec: dash draw-on of the full path over 1.6s. */
const DRAW_SECONDS = 1.6;

/** The house easing. Declared as a mutable tuple because motion's `BezierDefinition` is one. */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Variants rather than per-path `initial`/`animate`, so the three layers are driven by **one**
 * animation on the parent group.
 *
 * Two reasons. A `whileInView` on each path would install three viewport observers per instance
 * instead of one; and worse, three independently triggered animations can start on different
 * frames, so the halo would visibly lag the line it is supposed to be the glow of.
 *
 * `pathLength` is motion's normalised path length — it sets `pathLength="1"` on the element and
 * animates `stroke-dasharray`/`stroke-dashoffset`, so the dash maths does not have to be done
 * here and it works for any `d` without measuring it.
 */
const DRAW: Variants = {
  hidden: { pathLength: 0 },
  shown: { pathLength: 1, transition: { duration: DRAW_SECONDS, ease: EASE_OUT_EXPO } },
};

export interface CircuitCorner {
  /** Corner number as printed on a track map. */
  n: number;
  /** Normalised 0–1, same space as `points`. */
  x: number;
  y: number;
}

export interface CircuitGlowProps {
  /** Normalised 0–1 outline, densely sampled. */
  points: readonly Point[];
  corners?: readonly CircuitCorner[];
  /** 'glow' is the full three-layer red treatment; 'plain' a small grey outline. */
  variant?: 'glow' | 'plain';
  draw?: 'onView' | 'immediate';
  className?: string;
}

interface StrokeLayer {
  key: string;
  width: number;
  stroke: string;
  opacity?: number;
  filter?: string;
}

interface Marker {
  n: number;
  /** The dot, on the racing line. */
  x: number;
  y: number;
  /** The far end of the leader. */
  ex: number;
  ey: number;
  /** Where the number sits, just past the leader's end. */
  tx: number;
  ty: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * Glowing circuit map.
 *
 * Scales to fill its container: a `viewBox` plus `preserveAspectRatio="xMidYMid meet"`. `meet`
 * is the load-bearing half — it fits the whole 500×500 user space inside the container and
 * centres the slack, so a non-square container letterboxes the circuit instead of stretching it.
 * (`slice` would fill the box and crop the lap, and the default `xMidYMid meet` is only the
 * default until someone "tidies up" by setting `none`, which distorts.) This is the opposite
 * choice to `TopoBackground`, which deliberately has no viewBox because a texture must not
 * magnify with its container; a track map must scale, because the recognisable thing is the
 * whole lap.
 *
 * Decorative throughout: `aria-hidden` and `pointer-events-none`. The corner numbers are the
 * only text, and they are not part of the draw-on — a reveal never gates whether text exists,
 * and the worst case for a stuck animation here is an undrawn line, not a missing label.
 */
export function CircuitGlow({
  points,
  corners,
  variant = 'glow',
  draw = 'onView',
  className,
}: CircuitGlowProps) {
  const reducedMotion = useReducedMotion();
  const reactId = useId();

  /**
   * `useId` per instance, following `topo-background.tsx` and `components/ui/dot-pattern.tsx`.
   *
   * Several circuits sit on one page (a season grid is 24 of them). SVG ids are document-global,
   * so a hard-coded `id="circuit-blur"` would leave every instance's `filter="url(#…)"`
   * resolving to the **first** one's definition — which silently works while there is one on
   * screen and then breaks the moment there are two.
   */
  const blurId = `circuit-glow-blur-${reactId}`;

  const scaled = useMemo(
    () => points.map(([x, y]): Point => [PAD + x * SPAN, PAD + y * SPAN]),
    [points],
  );

  /**
   * Smoothed, not a polyline, and closed.
   *
   * These points are densely sampled off a surveyed outline, so Catmull-Rom is *interpolating*
   * between samples rather than inventing shape. `topo-background.tsx` uses `polylinePath` for
   * the opposite case — a sparse, schematic point set, where smoothing rounds every hairpin into
   * the same wide arc and the outline reads as a blob. Closed because a lap is a loop; an open
   * path leaves a visible notch at start/finish.
   */
  const d = useMemo(() => catmullRomPath(scaled, true), [scaled]);

  const markers = useMemo(() => buildMarkers(scaled, corners), [scaled, corners]);

  /**
   * Fewer than two points cannot describe a path and `catmullRomPath` returns `''` for it.
   * Render the shell with no geometry rather than `<path d="">`, which some renderers draw as a
   * dot at the origin. The shell stays instead of returning `null` because the parent sizes this
   * box: collapsing it on bad data would move the page, and CLS has to stay 0.
   */
  if (d === '') {
    return <svg {...frame(variant, className)} />;
  }

  const layers: StrokeLayer[] =
    variant === 'plain'
      ? [{ key: 'outline', width: PLAIN_WIDTH, stroke: 'currentColor' }]
      : [
          {
            key: 'halo',
            width: GLOW_WIDTH,
            stroke: 'currentColor',
            opacity: GLOW_OPACITY,
            filter: `url(#${blurId})`,
          },
          { key: 'line', width: LINE_WIDTH, stroke: 'currentColor', opacity: LINE_OPACITY },
          { key: 'core', width: CORE_WIDTH, stroke: CORE_COLOUR },
        ];

  /**
   * Reduced motion renders the final state: the circuit fully drawn, glow and all, with no
   * animation at all. Note that this is the *absence* of motion props rather than a zero
   * duration — a fully drawn path is what an SVG path does by default, so dropping `pathLength`
   * entirely is both the correct end state and the cheapest way to reach it.
   */
  const animated = !reducedMotion;
  const groupMotion: MotionProps = !animated
    ? {}
    : draw === 'onView'
      ? {
          initial: 'hidden',
          whileInView: 'shown',
          // Once, and only once — a track map that redraws every time it scrolls past is a toy.
          viewport: { once: true, margin: '-15% 0px' },
        }
      : { initial: 'hidden', animate: 'shown' };

  return (
    <svg {...frame(variant, className)}>
      {variant === 'glow' && (
        <defs>
          {/*
           * `filterUnits="userSpaceOnUse"` over the whole viewBox, not the default
           * `objectBoundingBox` percentages. A percentage region is a fraction of the *path's*
           * bounding box, so a narrow circuit gets a narrow margin: Monaco's box is roughly
           * twice as tall as it is wide, and the default -10%/120% region would clip the halo
           * off its short side while leaving room to spare on the long one. A region in user
           * units is the same for every circuit, and PAD already guarantees the geometry sits
           * far enough inside it that 3σ of blur has room.
           */}
          <filter id={blurId} filterUnits="userSpaceOnUse" x={0} y={0} width={VIEW} height={VIEW}>
            <feGaussianBlur stdDeviation={BLUR_STD} />
          </filter>
        </defs>
      )}

      {/*
       * `fill="none"` is not optional. Every one of these paths is closed, so without it the
       * browser fills the lap with the default black and the map becomes a silhouette.
       */}
      <motion.g fill="none" strokeLinecap="round" strokeLinejoin="round" {...groupMotion}>
        {layers.map((layer) => (
          <motion.path
            key={layer.key}
            d={d}
            stroke={layer.stroke}
            strokeWidth={layer.width}
            opacity={layer.opacity}
            filter={layer.filter}
            variants={animated ? DRAW : undefined}
          />
        ))}
      </motion.g>

      {markers.length > 0 && (
        <g>
          {markers.map((marker) => (
            <g key={marker.n}>
              {/*
               * The dot is warm off-white, not red: at a 3-unit radius on top of the red line it
               * would be invisible, and a grey one disappears into the halo.
               */}
              <circle className="fill-ink" cx={marker.x} cy={marker.y} r={DOT_RADIUS} />
              <line
                className="stroke-zinc-500"
                x1={marker.x}
                y1={marker.y}
                x2={marker.ex}
                y2={marker.ey}
                strokeWidth={LEADER_WIDTH}
              />
              {/*
               * Grey, never red. This is ~10px text and f1-red on the dark base is 4.01:1 —
               * clears WCAG's 3:1 large-text bar, fails the 4.5:1 that applies at this size.
               */}
              <text
                className="fill-zinc-500 font-mono"
                x={marker.tx}
                y={marker.ty}
                fontSize={NUMBER_SIZE}
                textAnchor={marker.anchor}
                dominantBaseline="middle"
              >
                {marker.n}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * The shared `<svg>` attributes, so the empty-geometry early return cannot drift from the real
 * one — the box has to be identical whether or not there is a lap to draw in it.
 *
 * Colour arrives as `currentColor` through a text class, exactly as `TopoBackground` does it:
 * the strokes then compose like any other element and a call site can retint the whole thing
 * with `className="text-zinc-600"` without a prop for it. `className` merges last so it wins.
 */
function frame(variant: 'glow' | 'plain', className?: string) {
  return {
    'aria-hidden': true,
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    preserveAspectRatio: 'xMidYMid meet',
    className: cn(
      'pointer-events-none h-full w-full',
      variant === 'plain' ? 'text-zinc-500' : 'text-f1-red',
      className,
    ),
  } as const;
}

/**
 * Place each corner's dot, leader and number.
 *
 * **The leader points away from the shape's centroid.** A leader is a pointer, and one aimed
 * inward runs back across the track it is labelling — on an oval it would cross the far side as
 * well. Outward is the only direction that is empty by construction, which is also why PAD is
 * sized to hold a leader plus its number.
 *
 * The centroid of the sampled points is a good enough interior reference here: these outlines
 * are dense and roughly evenly spaced along the lap, so the average lands inside the loop. It is
 * not the centre of area and does not need to be — the rule only has to get the *direction*
 * right, and a hairpin's corner is far enough from the middle for any interior point to do.
 */
function buildMarkers(scaled: readonly Point[], corners?: readonly CircuitCorner[]): Marker[] {
  if (!corners || corners.length === 0 || scaled.length === 0) return [];

  const cx = scaled.reduce((sum, [x]) => sum + x, 0) / scaled.length;
  const cy = scaled.reduce((sum, [, y]) => sum + y, 0) / scaled.length;

  // The `: Marker` annotation is what keeps `anchor` a literal union — a bare ternary of string
  // literals in a fresh object widens to `string` and then fails to satisfy `textAnchor`.
  return corners.map((corner): Marker => {
    const x = PAD + corner.x * SPAN;
    const y = PAD + corner.y * SPAN;

    const reach = Math.hypot(x - cx, y - cy);
    // A corner landing exactly on the centroid has no outward direction to compute; up is as
    // good as any other and beats dividing by zero.
    const dx = reach === 0 ? 0 : (x - cx) / reach;
    const dy = reach === 0 ? -1 : (y - cy) / reach;

    return {
      n: corner.n,
      x,
      y,
      ex: x + dx * LEADER_LENGTH,
      ey: y + dy * LEADER_LENGTH,
      tx: x + dx * (LEADER_LENGTH + NUMBER_GAP),
      ty: y + dy * (LEADER_LENGTH + NUMBER_GAP),
      // Anchor away from the shape too, so the glyphs sit beside the leader's end rather than
      // straddling it. The 0.35 band leaves near-vertical leaders centred, which is what reads
      // correctly for a number hanging directly above or below its dot.
      anchor: dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle',
    };
  });
}
