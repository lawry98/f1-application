'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** 500 ms, from the spec: "draw on over 500ms flanking the docked car". */
const DRAW_SECONDS = 0.5;

/**
 * How long the settle to 40% opacity takes once the draw finishes. The spec gives the draw a
 * duration but not the settle, so this is chosen rather than derived: short enough (300ms) that
 * the fade still reads as the tail of one continuous gesture — draw, then rest — rather than as a
 * second, separately-noticed animation starting after the first ends.
 */
const SETTLE_SECONDS = 0.3;

/** `ease-out-expo`, the house easing. Fast out of the gate, long settle. */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Where the stroke rests once it has finished drawing, per the spec. */
const SETTLED_OPACITY = 0.4;

/**
 * ViewBox for one branch. Tall rather than wide (32 × 100): a laurel half is a branch that runs
 * roughly the height of whatever it flanks, not a horizontal strip, which is why this does not
 * share `Scribble`'s wide viewBoxes.
 */
const VIEW_BOX_WIDTH = 32;
const VIEW_BOX = `0 0 ${VIEW_BOX_WIDTH} 100`;

/**
 * `strokeWidth` is picked for the render size, not the viewBox — the trap this branch has already
 * paid for twice (`Scribble`'s marks at 0.8–1.7px against an intended 2–3px, the hero underline at
 * ~7.5px against an intended ~2.4px). The task brief's reference render is a laurel half beside a
 * 36px docked car, i.e. the SVG's own height is 36px against this 100-unit viewBox: a scale of
 * 0.36. `3.5 × 0.36 = 1.26px` on screen, inside the "roughly 1–1.5px, a flourish not a mark" the
 * brief asks for.
 */
const STROKE_WIDTH = 3.5;

/**
 * The central stem, one gentle S-curve from the base (bottom of the viewBox) to the tip (top).
 * Curving consistently toward the centreline as it rises (16 → 13 → 18 → 13 → 9 → 14 → 9) is what
 * makes the *mirrored* pair read as two branches leaning toward each other and framing whatever
 * sits between them, rather than as two parallel strokes that happen to be on either side.
 */
const STEM_PATH = 'M 16 98 C 13 82, 18 66, 13 50 C 9 36, 14 20, 9 4';

/**
 * Six leaf-pairs strung along the stem, base to tip — inside the brief's "5–7 leaves per side,
 * not 15" for legibility at a ~36px render, where finer detail than this would not survive
 * rasterisation anyway.
 *
 * Each entry is **one `<path>` with two subpaths** (`M … C … M … C …`), not two separate paths:
 * unlike `Scribble`'s multi-stroke marks — which are separate paths *because* they need to
 * stagger, a hand drawing one stroke after another — a laurel leaf and its opposite-side partner
 * are drawn as a single unit here and never stagger against each other (only the two *branches*
 * do not stagger against each other either; see the note on `LaurelBranch` below). One path per
 * pair also halves the element count for no behavioural cost.
 *
 * Sizes step down (9 → 5 units of reach) from base to tip, the one piece of botanical realism kept
 * here: a laurel branch's leaves shrink toward the growing tip. Coordinates are approximate
 * attachment points along the hand-drawn stem above, not computed from it — this is ornament, not
 * geometry, and does not need to intersect the stem's Bezier exactly to read as attached to it at
 * this size.
 *
 * **Every leaf sweeps outward *and upward*, toward the tip at y=4, and that is the difference
 * between a laurel and a fish skeleton.** The first cut ran the leaves outward and slightly *down*
 * (`M 15 88 C 12 89, 9 90, 7 93`), which is a defensible botanical choice on paper and a defect on
 * screen: rendered at 36px against a near-vertical stem, six evenly-spaced pairs of short strokes
 * splaying downward read unmistakably as a spine with ribs. Sweeping them up gives the pair the
 * cupped, wreath-like silhouette that makes the two mirrored branches frame what sits between
 * them. Verified in Chromium at the docked size, which is the only size that matters here — this
 * is not visible in any test, because jsdom lays nothing out.
 */
const LEAF_PATHS = [
  'M 14.5 88 C 11 85.5, 8 83.5, 5.5 80 M 14.5 88 C 18 85.5, 21 83.5, 23.5 80',
  'M 16 74 C 12.7 71.7, 9.9 69.9, 7.5 66.6 M 16 74 C 19.3 71.7, 22.1 69.9, 24.5 66.6',
  'M 14.5 60 C 11.4 57.9, 8.8 56.2, 6.5 53.2 M 14.5 60 C 17.6 57.9, 20.2 56.2, 22.5 53.2',
  'M 11.5 46 C 8.8 44.2, 6.5 42.7, 4.5 40 M 11.5 46 C 14.2 44.2, 16.5 42.7, 18.5 40',
  'M 12 32 C 9.7 30.5, 7.7 29.2, 6 27 M 12 32 C 14.3 30.5, 16.3 29.2, 18 27',
  'M 10.5 18 C 8.6 16.7, 6.9 15.6, 5.5 13.7 M 10.5 18 C 12.4 16.7, 14.1 15.6, 15.5 13.7',
];

/**
 * Stem first, then leaves base to tip — the order a hand would draw a branch in. Both branches
 * share this one array; the right-hand branch is never a second hand-authored path (see
 * `LaurelBranch`), so editing a leaf here moves both sides identically instead of the two drifting
 * apart the way a hand-mirrored copy eventually would.
 */
const BRANCH_PATHS = [STEM_PATH, ...LEAF_PATHS];

/**
 * Mirrors the branch horizontally within its own viewBox. `scale(-1, 1)` alone reflects about
 * `x = 0`, which would swing the branch out to negative-x and off the left edge of its own SVG;
 * the `translate` first shifts the reflected copy back so it lands on `x ∈ [0, VIEW_BOX_WIDTH]`
 * again. (SVG's `transform` list composes right-to-left onto the point, so the scale is what
 * actually touches the coordinates first, then the translate.)
 */
const MIRROR_TRANSFORM = `translate(${VIEW_BOX_WIDTH}, 0) scale(-1, 1)`;

interface LaurelBranchProps {
  mirror: boolean;
  draw: 'onView' | 'immediate';
  prefersReducedMotion: boolean;
}

/**
 * One laurel branch. Renders `BRANCH_PATHS` verbatim; `mirror` only ever adds a `<g transform>`
 * around them, so the left and right halves are provably the same authored geometry — see
 * `laurel-flourish.test.tsx`'s assertion that every path pair shares a `d`.
 */
function LaurelBranch({
  mirror,
  draw,
  prefersReducedMotion,
}: LaurelBranchProps): React.JSX.Element {
  const ink = prefersReducedMotion ? (
    // The static final state: fully drawn, settled. A `motion.path` pinned at `pathLength: 1`
    // would still carry the dasharray/dashoffset pair that drives the draw-on — see the identical
    // note in `scribble.tsx` — so reduced motion gets plain `path`s and the opacity is a plain
    // attribute on the group around them, not a frozen animation.
    <g opacity={SETTLED_OPACITY}>
      {BRANCH_PATHS.map((d) => (
        // Keyed on the path data itself, not on the array index: `BRANCH_PATHS` entries are unique
        // and stable, and this repo carries zero eslint-disable comments, so `react/no-array-index-key`
        // is honoured rather than suppressed — the same call `redacted-reveal.tsx` made in Phase 2.
        <path key={d} d={d} />
      ))}
    </g>
  ) : (
    <>
      {BRANCH_PATHS.map((d) => {
        // Every path shares one transition and one trigger: the brief calls out that the two
        // *branches* must draw together rather than stagger ("staggering them reads as a glitch"),
        // and staggering the paths *within* one branch would blow the 500ms budget besides — six
        // leaf-pairs at `Scribble`'s 120ms stroke stagger alone would take until 720ms just to
        // start the last one.
        const transition = {
          pathLength: { duration: DRAW_SECONDS, ease: EASE_OUT_EXPO },
          // The opacity settle starts only once the draw has finished, not alongside it: `delay:
          // DRAW_SECONDS` on this property only, not on `pathLength`, is what turns "draw, then
          // settle" into two ordered stages of one `animate` call rather than two components.
          opacity: { duration: SETTLE_SECONDS, ease: EASE_OUT_EXPO, delay: DRAW_SECONDS },
        };
        const target = { pathLength: 1, opacity: SETTLED_OPACITY };

        return draw === 'immediate' ? (
          <motion.path
            key={d}
            d={d}
            initial={{ pathLength: 0, opacity: 1 }}
            animate={target}
            transition={transition}
          />
        ) : (
          <motion.path
            key={d}
            d={d}
            initial={{ pathLength: 0, opacity: 1 }}
            whileInView={target}
            // Once only, and 15% into the viewport — a flourish that redraws every time it
            // scrolls back past reads as a glitch rather than as an annotation.
            viewport={{ once: true, margin: '-15% 0px' }}
            transition={transition}
          />
        );
      })}
    </>
  );

  return (
    <svg
      // Decorative and nothing else, so this is set on the `<svg>` directly rather than on a
      // wrapping span the way `Scribble` does it: `Scribble`'s overlay span covers *only* the
      // mark, never the annotated word, but here the equivalent "only the mark" element already
      // is the `<svg>` — the sibling that must stay in the accessibility tree and stay
      // clickable is `children`, one level up in `LaurelFlourish`, so the attributes cannot live
      // on a shared ancestor of both without also hiding the content this flanks.
      aria-hidden="true"
      className="pointer-events-none block h-9 w-auto"
      viewBox={VIEW_BOX}
      // 36px (`h-9`) is the task brief's own reference size — a laurel half beside a 36px docked
      // car — and is what `STROKE_WIDTH` above is tuned against. A call site rendering this next
      // to something a different size overrides with `className="[&_svg]:h-6"` etc., the same
      // pattern `Scribble` uses for recolouring rather than a dedicated size prop.
      fill="none"
      // `currentColor`, never a hard-coded hex: a `<LaurelFlourish>` under an ancestor with no
      // declared text colour resolves this to `rgb(0, 0, 0)` and is invisible on this page's dark
      // background — `topo-background.tsx` carries the identical trap. The parent supplies
      // `text-ink` at the one known call site (the docked mini car in the header).
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {mirror ? <g transform={MIRROR_TRANSFORM}>{ink}</g> : <g>{ink}</g>}
    </svg>
  );
}

export interface LaurelFlourishProps {
  /**
   * What the two branches flank — the docked mini car at the first call site, a wider header
   * block at the Phase 6 one. Optional: a bare `<LaurelFlourish />` renders just the pair with a
   * gap between them, for a call site that positions its own content over that gap instead.
   */
  children?: React.ReactNode;
  /**
   * Same name and semantics as `Scribble`'s `draw` prop, deliberately: a kit where two components
   * spell the same idea two different ways is a defect. `'onView'` is the default for that
   * consistency, but neither of this component's two known call sites (the header dock, the
   * completed-briefing trace) are scroll-triggered — both are state changes — so both are
   * expected to pass `draw="immediate"` and additionally only *mount* this component once that
   * state flips true. Because `initial`/`animate` only run on mount, not on every re-render of an
   * already-mounted instance, the draw then fires exactly once, at the moment the parent's
   * condition first becomes true, and never replays for as long as the parent keeps rendering it:
   *
   * ```tsx
   * {docked && (
   *   <LaurelFlourish draw="immediate" className="text-ink">
   *     <DockedCar />
   *   </LaurelFlourish>
   * )}
   * ```
   *
   * The parent must not toggle the surrounding condition off and back on to "replay" the
   * flourish — that unmounts and remounts the component, which is a valid way to force a replay
   * but is almost certainly not what a dock transition wants happening on every scroll frame it
   * flickers near the threshold.
   */
  draw?: 'onView' | 'immediate';
  className?: string;
}

/**
 * Two thin ink laurel-branch strokes that draw themselves on and settle to 40% opacity, flanking
 * whatever they wrap.
 *
 * Renders as `<left branch> {children} <right branch>` in a flex row — the shape that lets one
 * component serve both call sites the spec asks for: something small in a header slot now (the
 * docked car sits between the branches) and something wrapping a wider block later (Phase 6's
 * briefing header). Neither branch is absolutely positioned over the children the way `Scribble`'s
 * mark overlays its word — a laurel flanks, it does not annotate, so ordinary flex layout is the
 * right tool and there is no overlay span to keep `relative` for.
 *
 * Each branch's `<svg>` carries its own `aria-hidden` and `pointer-events-none` (see
 * `LaurelBranch`); the wrapper here deliberately does **not** repeat them, because unlike
 * `Scribble` — whose overlay covers only its mark and never the annotated word — this wrapper's
 * only other child is `children` itself, which must stay in the accessibility tree and stay
 * clickable. Hiding the wrapper would hide the docked car, or the Phase 6 header block, along
 * with the flourish.
 *
 * No intrinsic width. The wrapper is `inline-flex`, so it sizes to its children plus the two fixed
 * ~14px-wide branch glyphs (36px tall × the viewBox's 0.32 aspect) and a small gap; it does not
 * fill a parent the way `TopoBackground` does.
 */
export function LaurelFlourish({
  children,
  draw = 'onView',
  className,
}: LaurelFlourishProps): React.JSX.Element {
  const prefersReducedMotion = Boolean(useReducedMotion());

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LaurelBranch mirror={false} draw={draw} prefersReducedMotion={prefersReducedMotion} />
      {children}
      <LaurelBranch mirror draw={draw} prefersReducedMotion={prefersReducedMotion} />
    </span>
  );
}
