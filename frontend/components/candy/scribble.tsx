'use client';

import { motion } from 'motion/react';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

export type ScribbleType = 'circle' | 'underline' | 'p1' | 'strike';

/**
 * Reference: the scale each mark is drawn at when it wraps a `text-2xl` word, as the geometric mean
 * of its two axis scales, measured in Chromium at 1440×900.
 *
 *   circle     134.9 × 43.5 box / 200 × 100 viewBox → 0.67 × 0.44 → 0.54
 *   underline  144.7 × 12.2      / 220 × 22         → 0.66 × 0.55 → 0.60
 *   p1         154   × 48.6      / 110 × 106        → 0.46 uniform (`meet`)
 *   strike      64.2 × 32        / 200 × 60         → 0.32 × 0.53 → 0.41
 *
 * These are what `strokeWidth` per shape is derived from, and why it **has to** be per shape: the
 * scales differ by nearly 1.5×, so one shared width in viewBox units renders as four different
 * widths on screen. A shared 2.5 measured 0.8px on the strike against 1.7px on the circle — a fine
 * technical pen, not the marker the brief asks for, and inconsistent between marks sitting side by
 * side. Each shape's width is instead set so that width × scale lands near 2.5px, inside the
 * brief's 2–3px. `scribble.test.tsx` asserts that product for every type, which is the guard for
 * anyone adding a fifth mark.
 *
 * The stroke still scales with the container (see `preserveAspectRatio`), so a mark over a
 * `.text-mega` headline draws a proportionally fatter line than one over a caption. That is
 * deliberate — a marker held over bigger letters leaves a bigger mark — and the alternative is
 * worse; see the note on `vector-effect` in `SHAPES`.
 */

/** 800 ms, from the spec. Long enough to read as a hand moving, short enough not to hold a page. */
const DRAW_SECONDS = 0.8;

/**
 * Gap between the strokes of a multi-stroke mark.
 *
 * A hand does not draw two strokes at once, and drawing them simultaneously is the single tell
 * that gives the whole effect away — the "P" bowl and the "1" appearing in lockstep looks like a
 * loading skeleton, not handwriting. 120 ms is the top of the spec's 80–120 ms stagger band, taken
 * deliberately: at 80 ms the three `strike` slashes still read as one event.
 */
const STROKE_STAGGER_SECONDS = 0.12;

/** `ease-out-expo`, the house easing. Fast out of the gate, long settle — a pen decelerating. */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

interface ScribbleShape {
  viewBox: string;
  /** In viewBox units, tuned to render ~2.5px at the reference scale above. */
  strokeWidth: number;
  /**
   * One entry per pen stroke, in the order a hand would draw them. Order is load-bearing: it is
   * also the stagger order.
   */
  paths: string[];
  /**
   * How the mark is placed over the content it annotates. Always absolute, so adding a scribble
   * can never move the thing it marks — CLS stays 0 even for the marks that deliberately extend
   * outside the content box, because a negative inset on an absolutely positioned element does not
   * participate in layout at all.
   *
   * These classes go on the overlay **span**, never on the `<svg>`, and every entry constrains both
   * axes. See the note above the `<span>` in `Scribble` for the measured bug that rule comes from.
   *
   * The offsets are percentages rather than `em` wherever the mark has to keep its proportion to
   * the text. `em` on the overlay resolves against the *overlay's* inherited font size, which is
   * the wrapper's — and in the usual call site the `text-2xl` lives on a child *inside* the
   * wrapper, so `em` silently measured 16px against 24px text. Percentages resolve against the
   * wrapper's own box, which is the annotated text's box, which is what we actually meant.
   */
  overlay: string;
  /**
   * `none` lets the mark stretch to whatever it is annotating, which is the point — unlike
   * `TopoBackground` (fixed pixel tile, never scaled) this SVG is *tracking the size of the thing
   * it is drawn over*. A hand circling a six-word phrase draws a long flat ellipse, not a small
   * round one centred on the phrase, and `xMidYMid meet` gives exactly that wrong second thing:
   * it fits the mark *inside* the box, so a wide word ends up with a circle around its middle
   * third.
   *
   * `p1` is the exception and keeps `meet`, because it is glyphs. Stretching letterforms
   * non-uniformly reads as a broken font rather than as a hand — the one distortion the eye
   * recognises instantly.
   */
  preserveAspectRatio: 'none' | 'xMidYMid meet';
}

/**
 * The four marks, hand-authored.
 *
 * **These path strings are the component.** They are typed out coordinate by coordinate, not
 * generated, and deliberately *not* built from `@/lib/svg-path` — that module interpolates
 * *sampled* geometry (contours, telemetry), and a scribble has nothing to sample. Running these
 * through `catmullRomPath` would also undo the thing that makes them work: Catmull-Rom smooths
 * every direction change to a similar radius, and a hand's radius changes constantly.
 *
 * What separates "drawn" from "generated", in the order it matters:
 *
 *   1. **No symmetry.** No mark's left half mirrors its right. The `circle`'s two laps run 12–15
 *      units apart down the bottom left and converge to a crossing at the start; the `p1` sits 18
 *      units from the left edge and 14 from the right; the two `underline` passes have different
 *      wavelengths on purpose.
 *   2. **Overshoot where a stroke crosses back over itself.** It misses instead of retracing: the
 *      `circle`'s second lap passes ~3 units *outside* its own start point and then cuts inside, so
 *      the two laps genuinely cross between x=140 and x=161, and the "P" bowl closes 3.5 units
 *      *past* the stem rather than onto it. Retracing exactly is what makes a shape read as a
 *      shape.
 *   3. **Varying curvature.** Control points are pulled unevenly, so the pen is quick through some
 *      arcs and laboured through others.
 *
 * One piece of Bezier arithmetic governs all of it, and getting it wrong flattened the first
 * `underline` completely: a cubic's midpoint is `(y0 + 3·c1 + 3·c2 + y3) / 8`, so a full wave
 * written as *one* cubic with opposing controls at y=9 and y=22 peaks at 15.5 — a straight line
 * with a kink. Every swing below is therefore **one cubic per half-wave**, with the extremes as
 * endpoints rather than as control points.
 *
 * Rejected: `vector-effect="non-scaling-stroke"`, which would hold each line at a fixed *CSS* px
 * width no matter how far the mark stretches. It is the obvious fix for a stretched stroke, and it is not
 * used because motion animates `pathLength` by setting the SVG `pathLength` attribute to 1 and
 * expressing `stroke-dasharray` as a fraction of it. Those dash lengths resolve in the *unscaled*
 * stroke space, so under a non-uniform stretch the fully-drawn state can land short of the end of
 * the path — a mark that never finishes drawing. That interaction could not be verified in a
 * browser from this task, and a scribble that scales its stroke is a taste question while a
 * scribble that stops half-drawn is a bug, so the safe branch was taken.
 */
const SHAPES: Record<ScribbleType, ScribbleShape> = {
  /*
   * A loose ellipse of about 1.5 revolutions: it starts at 4:30 on the clock face, runs clockwise
   * all the way round to 4:30 again, and carries on to 10:20 — 1.46 laps, measured as the angular
   * sweep of its own segment endpoints, which is also what `scribble.test.tsx` asserts. Passing the
   * start and continuing is the whole trick. It is what a hand does when it circles something and
   * does not trust the first lap, and it is why this cannot be a closed path: a `Z` would snap the
   * two loose ends together into an outline, the failure mode this shape exists to avoid.
   *
   * The second lap runs 12–15 units inside the first rather than on top of it. An earlier version
   * kept them 6 units apart, which looks fine at the natural viewBox and merges into one fat line
   * once the mark is squashed onto a single line of text — a 24px word gives a vertical scale of
   * about 0.46, so a 6-unit gap comes out at 2.8px against a 2.5px stroke.
   *
   * The coordinates are an **affine remap of the authored shape onto its own viewBox**, so the ink
   * spans 1..199 × 1..99 instead of the 13..182 × 9..91 it was drawn at. That matters because the
   * ink's padding inside the viewBox is *proportional* while a CSS inset is not: at the original
   * padding of 6.6% the ellipse landed ~3px inside a 122px word's left edge and 28px inside a 600px
   * one, cutting through the first and last glyph at every size. Now the SVG box *is* the ink box,
   * so `-inset-x-[5%]` means what it says — the mark extends 5% past the word — at any size. The
   * remap is a pure scale of 1.17 × 1.20, so the hand-drawn character is untouched, and the angular
   * sweep the test measures moved only from 1.456 to 1.461 turns.
   */
  circle: {
    // 5 × 0.54 = 2.71px on screen at the reference size.
    strokeWidth: 5,
    viewBox: '0 0 200 100',
    paths: [
      'M 161 90.4 C 116.6 104.8, 48.7 102.4, 13.6 73.7 C -7.4 55.7, -2.8 25.8, 32.3 10.2 ' +
        'C 62.8 -2.9, 135.3 -2.9, 175.1 16.2 C 203.1 30.6, 207.8 56.9, 182.1 76 ' +
        'C 193.8 88, 168.1 96.4, 130.6 94 C 93.2 91.6, 53.4 85.6, 27.7 64.1 ' +
        'C 13.6 52.1, 13.6 37.8, 25.3 23.4',
    ],
    // 5% of the word's width out each side, 18% of its height above and below: for the 122.6×32 box
    // a `text-2xl` word measures in Chromium, that is a 134.9×43.5 overlay, and the ink fills it.
    // Percentages rather than px so the air stays proportional — and 18% keeps the bottom edge 5.8px
    // under the word, clear of the caption line ~12px below it. Tight to the glyphs a circle reads
    // as a border-radius rather than as a pen, which is why it gets air at all.
    overlay: 'absolute -inset-x-[5%] -inset-y-[18%]',
    preserveAspectRatio: 'none',
  },

  /*
   * Two zigzag passes under a word, deliberately at **different wavelengths** — about 58 units for
   * the first pass against 38 for the second — so they cross four times, around x≈160, 110, 75 and
   * 35. Matched wavelengths were tried first: two waves in antiphase braid evenly and read as a
   * decorative ribbon border, not as someone underlining twice. The looser first pass and the more
   * agitated second one also tell the right story about the order they were drawn in.
   *
   * Two paths rather than one, so they stagger: the second pass is a decision the hand makes after
   * the first, and it should arrive after it.
   *
   * The 220×22 viewBox is a 10:1 aspect on purpose. With `preserveAspectRatio="none"` the mark is
   * only undistorted where the container matches that ratio, and a display word plus the band below
   * is close to it — "LIGHTS OUT" at `text-2xl` measures 144.7×12.2px, scaling 0.66 horizontally
   * against 0.55 vertically — so the shape holds roughly its authored proportions at the sizes this
   * is actually used at.
   *
   * This one keeps its authored padding, unlike `circle`, because the padding is already tiny: the
   * ink spans x 5..215 of 220, i.e. 2.3% each side, so at `-inset-x-1` it lands within a pixel of
   * the word's own edges — which is the brief ("span the full word width"). Vertically the ink sits
   * in the top 84% of the viewBox, and that is deliberate: it is what puts the strokes just under
   * the baseline rather than in the middle of the band.
   */
  underline: {
    // 4 × 0.60 = 2.42px on screen at the reference size.
    strokeWidth: 4,
    viewBox: '0 0 220 22',
    paths: [
      'M 5 13 C 23 14, 43 11, 60 7 C 81 3, 105 9, 120 15 C 137 21, 159 15, 176 8 ' +
        'C 191 3, 204 8, 215 12',
      'M 214 17 C 199 18, 183 12, 172 5 C 157 -3, 139 7, 128 16 C 117 23, 105 14, 96 4 ' +
        'C 83 -6, 65 7, 54 15 C 41 23, 30 14, 18 7',
    ],
    // 4px past each end of the word — a hand starts before the word and stops after it — and a band
    // 38% of the word box's height hanging 16% below it. For a 136.7×32 box that is 144.7×12.2 at
    // y 24.9–37.1, which puts the ink from the baseline (25.6) to 3px under the box. `top` is left
    // `auto` on purpose: `bottom` plus `height` is the pair that expresses "hangs below the text",
    // and it still constrains the vertical axis, which is what stops the SVG sizing itself.
    overlay: 'absolute -inset-x-1 -bottom-[16%] h-[38%]',
    preserveAspectRatio: 'none',
  },

  /*
   * "P1" in three strokes, in writing order: the P's stem, the P's bowl, then the 1.
   *
   * The stem bows left and returns (26 → 21 → 25), which is what a fast downstroke does. The bowl
   * closes at x=18, about 3.5 units *past* the stem it should meet — the overshoot that says this
   * was drawn rather than set. The 1 is a single stroke with the up-flick into the apex and the
   * downstroke joined at a hard reversal at (95,12), because that reversal is the whole character
   * of a handwritten 1; a bare vertical bar reads as a lowercase l.
   *
   * No base serif on the 1: it would need a fourth stroke, and hand-written race positions do not
   * get one.
   */
  p1: {
    // 5.5 × 0.46 = 2.52px on screen at the reference size.
    strokeWidth: 5.5,
    viewBox: '0 0 110 106',
    paths: [
      'M 26 12 C 22 40, 21 68, 25 99',
      'M 22 14 C 48 6, 72 15, 69 34 C 66 49, 44 54, 18 52',
      'M 78 38 C 84 29, 89 21, 95 12 C 93 40, 91 68, 96 99',
    ],
    // A quarter of the word box's height past it at each end, because `xMidYMid meet` fits the mark
    // *inside* the box: capped at the box exactly, a P1 written across a name would be no taller
    // than the name, and it should overshoot it a little. For the 154×32 box a `text-2xl` name
    // measures that is 154×48.6, and `meet` then draws the mark ~50 wide, centred. Percentages, not
    // `em`: this rendered 148px tall — 3× too tall, overflowing the card — while the `em` resolved
    // against the wrapper's 16px instead of the child's 24px.
    overlay: 'absolute inset-x-0 -inset-y-[26%]',
    preserveAspectRatio: 'xMidYMid meet',
  },

  /*
   * Three slashes over the same words, drawn in the order impatience produces them: one long
   * diagonal up to the right, one back down the other way at a different angle so it cuts the
   * first, then a short steep flick through the middle that crosses both.
   *
   * The angles are what make it energetic: 11.5°, 5.3° and 46° above horizontal. The first two are
   * only 6° apart, which is enough to scissor them across the middle of the word instead of
   * doubling up, and the third cuts both. A version with all three near-parallel read as a
   * redaction bar — which is a different component on this branch, and it should not be possible to
   * mistake one for the other.
   */
  strike: {
    // 5.5 × 0.41 = 2.28px on screen at the reference size.
    strokeWidth: 5.5,
    viewBox: '0 0 200 60',
    paths: [
      'M 8 48 C 60 36, 118 24, 194 10',
      'M 188 21 C 138 34, 84 22, 14 37',
      'M 96 52 C 108 40, 122 26, 138 8',
    ],
    // Overshoots each end by 8px — a strike-through that stops exactly at the last glyph looks
    // measured. `inset-y-0` rather than nothing at all: vertically flush is the intent (it has to
    // cross the text, not sit outside it), but it has to be *stated*, because a vertical axis left
    // unconstrained is what let this render 19.2px tall inside a 32px word box.
    overlay: 'absolute -inset-x-2 inset-y-0',
    preserveAspectRatio: 'none',
  },
};

export interface ScribbleProps {
  type: ScribbleType;
  /** Wrapped content. The scribble overlays it; omit for a bare scribble. */
  children?: React.ReactNode;
  draw?: 'onView' | 'immediate';
  /**
   * Seconds to wait before the first stroke starts, on top of the per-stroke stagger.
   *
   * It exists for marks that annotate something which is itself animating in. The landing hero
   * underlines a headline line that sits under a `RedactedReveal` bar for the first ~750 ms; drawn
   * at 0 the mark is finished and hidden behind the bar before the bar clears, so the annotation
   * never appears to be *made* — it is simply already there, which is the one thing the draw-on
   * exists to avoid.
   */
  delay?: number;
  className?: string;
}

/**
 * A hand-drawn marker annotation that draws itself over its children.
 *
 * The children render **normally and immediately** — this component adds an overlay and nothing
 * else. Nothing about the animation gates whether the content exists, so the worst case for a
 * scribble that never draws is a missing decoration, never missing text.
 *
 * The wrapper is `relative inline-block`: `relative` because the overlay resolves its inset
 * against it (drop the `relative` and every mark escapes to the nearest positioned ancestor,
 * typically the section, and lands nowhere near its word), and `inline-block` so a scribble can
 * mark one word mid-sentence without breaking the line. Both are in the merged `className`, so a
 * call site that needs a block-level box (`className="block h-24 w-24"`, which is what a bare
 * `p1` needs) can say so.
 *
 * Colour comes from `text-f1-red` plus `stroke="currentColor"` rather than a hard-coded hex. The
 * colour class sits on the **overlay**, not on the wrapper, which is the one placement that works:
 * on the wrapper it would cascade into the children and turn the annotated headline red along with
 * the mark. That does mean `className` (which lands on the wrapper, where a call site's sizing has
 * to go) cannot recolour the stroke directly — recolour with an arbitrary variant instead,
 * `className="[&_svg]:text-ink"`, which is what `currentColor` is still here to make possible.
 *
 * Red is unconstrained here: the 4.01:1 contrast floor applies to red *text*, and this is a
 * decorative stroke.
 */
export function Scribble({
  type,
  children,
  draw = 'onView',
  delay = 0,
  className,
}: ScribbleProps): React.JSX.Element {
  // `useReducedMotionSafe`, not motion's `useReducedMotion`: the preference picks `motion.path`
  // against a plain `path`, i.e. it changes the elements returned, and motion's hook disagrees
  // between the server and the client's first render. Root-cause note in `redacted-reveal.tsx`.
  const prefersReducedMotion = useReducedMotionSafe();
  const shape = SHAPES[type];

  return (
    <span className={cn('relative inline-block', className)}>
      {children}
      {/*
       * The insets live on this span and **never on the `<svg>`**, and that is the whole reason it
       * exists rather than the SVG being positioned directly.
       *
       * An `<svg>` is a *replaced* element, so with `height: auto` its own viewBox ratio sizes it
       * and CSS `bottom` is dropped as over-constrained (CSS 2.1 §10.6.5). Measured in Chromium at
       * 1440×900, each mark wrapping a `text-2xl` word in a 32px-tall box, with the insets on the
       * SVG:
       *
       *   type       word box      rendered        wanted
       *   circle     122.6 × 32    154.6 × 77.3    ~135 × 44   (ran down into the caption below)
       *   underline  136.7 × 32     63.9 × 6.4     ~145 wide   (spanned 47% of the word)
       *   p1         154   × 32    154   × 148.4   ~154 × 49   (3× too tall, overflowed the card)
       *   strike      48.2 × 32     64.2 × 19.2     64.2 × 32
       *
       * Every row is just the viewBox ratio: strike's 200×60 at width 64.2 is 19.26, p1's 110×106
       * at width 154 is 148.4. A span has no intrinsic ratio, so all four of its insets are
       * honoured, and the SVG then fills it from an explicit `h-full w-full` instead of `auto`.
       *
       * `aria-hidden` and `pointer-events-none` go here, once: both cover the whole subtree, so
       * repeating them on the SVG would be noise rather than defence.
       */}
      <span aria-hidden="true" className={cn('pointer-events-none absolute', shape.overlay)}>
        <svg
          viewBox={shape.viewBox}
          preserveAspectRatio={shape.preserveAspectRatio}
          // `block` because an inline replaced element sits on the line box's baseline, which would
          // hang a full-height SVG below its own box by the descender gap. `overflow-visible`
          // belts-and-braces the negative insets: half the stroke width sits outside the path's own
          // extent, and the default `overflow: hidden` on an SVG would shave that half off flat
          // wherever a stroke runs near a viewBox edge — a clipped scribble looks like a printing
          // error.
          className="block h-full w-full overflow-visible text-f1-red"
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.strokeWidth}
          // Round caps and joins are what stop a scribble reading as a shape: a butt cap ends a
          // stroke on a hard 90° edge, which is the one thing a felt tip cannot do. Set once on the
          // root and inherited, so no stroke can drift from the others.
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {shape.paths.map((d, index) => {
            const key = `${type}-${index}`;

            // Reduced motion gets the finished mark from a plain `path`, not a `motion.path` frozen
            // at its end state. A `motion.path` with `pathLength: 1` still writes the
            // dasharray/dashoffset pair that drives the draw-on, and any of it left in the tree is
            // a way for the mark to end up partially drawn. No animation means no dash pattern.
            if (prefersReducedMotion) {
              return <path key={key} d={d} />;
            }

            const transition = {
              duration: DRAW_SECONDS,
              ease: EASE_OUT_EXPO,
              // The call site's wait is added to, not substituted for, the per-stroke stagger:
              // holding the mark back must not collapse the strokes into one simultaneous event,
              // which is the tell the stagger exists to remove.
              delay: delay + index * STROKE_STAGGER_SECONDS,
            };

            // motion animates `pathLength` directly — it sets the SVG `pathLength` attribute to 1
            // so the dash lengths become fractions of the path, and does the dasharray/dashoffset
            // maths itself. Hand-rolling that would mean measuring `getTotalLength()` in an effect,
            // which returns 0 under jsdom and needs a re-render to apply.
            return draw === 'immediate' ? (
              <motion.path
                key={key}
                d={d}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={transition}
              />
            ) : (
              <motion.path
                key={key}
                d={d}
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                // Once only, and 15% into the viewport: a mark that redraws every time it scrolls
                // back past reads as a glitch rather than as an annotation.
                viewport={{ once: true, margin: '-15% 0px' }}
                transition={transition}
              />
            );
          })}
        </svg>
      </span>
    </span>
  );
}
