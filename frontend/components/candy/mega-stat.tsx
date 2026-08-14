'use client';

import { isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';
import { Scribble, type ScribbleType } from '@/components/candy/scribble';

/**
 * Spring feel for the count-up: a slow-ish critical-ish damping so the number visibly overshoots
 * decimals-worth then settles, rather than a linear ramp — a linear count reads as a progress bar,
 * a spring reads as a mechanical odometer catching up. `components/ui/number-ticker.tsx` uses
 * damping 60 / stiffness 100; this is a touch softer (more settle time) because that component
 * counts small UI numbers while this one is driving `.text-mega` digits people are meant to notice.
 */
const COUNT_SPRING = { damping: 40, stiffness: 90, mass: 1 } as const;

/**
 * Every scroll-triggered instance in this kit fires **once**, at this margin — `Scribble` and
 * `LaurelFlourish` inline the same pair. A mark that redraws each time it scrolls back past reads
 * as a glitch rather than as an annotation, and `once: false` on a count-up would re-run the
 * spring from 0 every time the stat left and re-entered the viewport.
 */
const ONCE_IN_VIEW = { once: true, margin: '-15% 0px' } as const;

/**
 * The `type` the always-mounted `Scribble` carries when there is no mark to draw.
 *
 * `Scribble`'s `type` is required, and the wrapper is now rendered unconditionally (see the
 * counting-box call site), so an unmarked stat still has to name one. `p1` rather than an arbitrary
 * pick: it is the only type any call site passes on a *toggling* prop — `/teams` turns the mark on
 * for the championship leader and off for the other ten — so choosing it means `type` never
 * actually changes there, and the `motion.path` elements keyed off it never remount either. Nothing
 * about the choice is visible: when `scribble` is undefined the mark is withheld, so no geometry
 * from this shape is ever painted.
 */
const SCRIBBLE_PLACEHOLDER: ScribbleType = 'p1';

/**
 * Withholds the mark itself while leaving `Scribble`'s element in the tree.
 *
 * `display: none` rather than `opacity-0`: an invisible-but-laid-out SVG still intersects the
 * viewport, so `Scribble`'s `whileInView` would fire and its `viewport={{ once: true }}` would
 * consume the one draw the mark gets — a stat that later *became* the leader would then show a
 * mark that was already finished, never one being made. A display-none element has no box and
 * therefore never intersects, so the draw is still waiting when the mark is wanted.
 *
 * `[&_svg]:` is the same descendant hook `scribbleClassName` documents for recolouring, and the
 * only one that reaches inside `Scribble` from here: `[&>span]` would also match the counting box,
 * which is `Scribble`'s other child.
 */
const SCRIBBLE_WITHHELD = '[&_svg]:hidden';

/**
 * Why this isn't built on `components/ui/number-ticker.tsx`, even though it does a spring count-up
 * over the same `useMotionValue`/`useSpring` primitives:
 *
 * 1. It never calls `useReducedMotion()`. Its spring still runs full-length under a reduced-motion
 *    preference, which is exactly the failure this kit's spec forbids — reduced motion has to
 *    render the *final* value with no count, not merely a fast one.
 * 2. It renders `startValue` (`0`) as the element's only child, so the box is exactly as wide as
 *    "0" on first paint and grows with every digit added. Reserving the *final* value's width from
 *    the first frame is the single most important detail of this component — see the counting-box
 *    comment below — and nothing in `number-ticker.tsx` does it.
 * 3. It mutates `ref.current.textContent` directly and never renders the true final value anywhere
 *    in the tree, so a screen reader landing mid-count (or a test asserting the accessible value)
 *    has nothing correct to read until the spring finishes settling.
 *
 * All three are fixable on top of it, but fixing them is most of this file, so it's reimplemented
 * locally instead of wrapped.
 */
export interface MegaStatProps {
  /** A number counts up; a string renders as-is with no count. */
  value: number | string;
  /** Small-caps label above the numeral. */
  label: string;
  /**
   * Raised ordinal suffix. A string ('ST' | 'ND' | 'TH') gets the raised `<sup>` treatment; an
   * *element* is rendered verbatim instead, because the only reason to pass one is that the call
   * site wants its own box — `/teams` renders `1ST` as a chip — and `align-super text-[0.35em]`
   * would shrink that chip to a third of a line and hang it off the baseline, i.e. un-chip it.
   */
  ordinal?: ReactNode;
  /** Raised trailing fragment, e.g. '.909' on a lap time, or '%'. */
  sup?: string;
  /** Overlays a Scribble across the numeral. Used for P1 moments. */
  scribble?: ScribbleType;
  /**
   * Forwarded to the internal `<Scribble>`'s own `className`, which is the only way to reach it —
   * the element is this component's internal, so `Scribble`'s documented recolour escape hatch
   * (`[&_svg]:text-…`, needed because a bare text colour on its wrapper cascades into the annotated
   * children) would otherwise be unreachable. It is needed: the mark is locked to `text-f1-red`, so
   * a `p1` over a Ferrari/Sauber/Alpine panel is a red scrawl on red.
   */
  scribbleClassName?: string;
  /** 'mega' is the .text-mega display scale; 'mid' the clamp(2.5rem, 6vw, 4.5rem) variant. */
  scale?: 'mega' | 'mid';
  /** Per-part colour overrides for call sites on a coloured surface. See `MegaStatTone`. */
  tone?: MegaStatTone;
  className?: string;
}

/**
 * Per-part colour overrides. `className` lands on the outer `div` only, and every colour this
 * component paints lives on a *descendant* — the numeral's `text-ink`, the tick's `bg-f1-red`, the
 * label's `text-zinc-400` — so a call site over a coloured panel (the `/teams` right rail sits on a
 * per-team gradient) cannot reach any of them through `className`. Each field replaces exactly the
 * hard-coded class named in its own doc comment and nothing else.
 *
 * Contrast becomes the caller's problem the moment one of these is set, and it is a real one: the
 * kit's floor is 4.5:1 for the 11px label, so a `tone.label` has to be measured against whatever
 * backdrop the call site puts behind it (`lib/team-utils.ts` has the helpers for exactly that).
 * The defaults clear it on the dark page — `tests/mega-stat.test.tsx` asserts that with
 * `contrastRatio`, as a ratio rather than as a class-name match.
 */
export interface MegaStatTone {
  /** Replaces `text-ink` on the numeral. */
  numeral?: string;
  /** Replaces `bg-f1-red` on the tick bar. */
  tick?: string;
  /** Replaces `text-zinc-400` on the label. */
  label?: string;
}

/**
 * A huge display-scale statistic: tick bar, small-caps label, then a numeral that counts up from
 * 0 with a spring the first time it scrolls into view.
 */
export function MegaStat({
  value,
  label,
  ordinal,
  sup,
  scribble,
  scribbleClassName,
  scale = 'mega',
  tone,
  className,
}: MegaStatProps): React.JSX.Element {
  // `useReducedMotionSafe`, not motion's `useReducedMotion`: `shouldAnimate` decides *which span
  // carries the text*, and motion's hook answers `null` on the server against the real preference
  // on the client's first render. See the root-cause note in `redacted-reveal.tsx`.
  const prefersReducedMotion = useReducedMotionSafe();
  const containerRef = useRef<HTMLSpanElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(containerRef, ONCE_IN_VIEW);

  const isNumeric = typeof value === 'number';
  // Round to an integer while counting. Fractional stats in this kit (a ".909" lap-time
  // remainder, a "%" ) arrive through the separate `sup` prop instead of a fractional `value`, so
  // the counted number itself is always whole — see the spec's own example, `379` points.
  const finalText = isNumeric ? String(Math.round(value)) : value;
  const shouldAnimate = isNumeric && !prefersReducedMotion;

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, COUNT_SPRING);

  useEffect(() => {
    if (shouldAnimate && isInView) {
      motionValue.set(Math.round(value as number));
    }
  }, [shouldAnimate, isInView, motionValue, value]);

  useEffect(() => {
    if (!shouldAnimate) return undefined;
    return spring.on('change', (latest) => {
      // Direct textContent write, same technique `number-ticker.tsx` uses: a `useSpring` value
      // changes on every animation frame, and routing that through React state would re-render
      // the whole component (and every sibling in the grid stack below) 60 times a second for no
      // benefit — nothing else in the tree depends on the intermediate digits.
      if (displayRef.current) {
        displayRef.current.textContent = String(Math.round(latest));
      }
    });
  }, [shouldAnimate, spring]);

  const numeralSizeClass =
    scale === 'mega'
      ? 'text-mega'
      : // The mid variant: same negative tracking and tight leading as .text-mega, just at the
        // clamp the spec calls for, since .text-mega's own clamp is fixed and not reusable at a
        // different size.
        'text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.85] tracking-tight';
  // Deliberately *not* `cn(numeralSizeClass, 'font-display text-ink')`: tailwind-merge groups any
  // bare `text-<word>` utility it doesn't recognise as a font-size into the same conflict class as
  // `text-color`, so a single `twMerge` call holding both bare `text-mega` and `text-ink` drops
  // one of them (verified — `twMerge('text-mega text-ink')` returns only `text-ink`). The bracket
  // form (`text-[clamp(...)]`, the `mid` scale) doesn't trip this, because twMerge sniffs the
  // bracket contents for a length unit and classifies it correctly — only the bare custom class is
  // ambiguous. Splitting the size class onto the outer element and the color/font onto the inner
  // one keeps the two out of the same `cn()` call entirely, which is the only fix that doesn't
  // involve reaching into `tailwind.config.ts` (out of scope — the parent owns shared files).
  //
  // `tone.numeral` therefore has to be merged **here**, on the inner span, and never alongside
  // `numeralSizeClass`: routing it through the same `cn()` as bare `text-mega` would resurrect the
  // exact bug above, silently dropping the display size for whatever colour the caller passed.
  const numeralColorClass = cn('font-display text-ink', tone?.numeral);

  // The counting box: two spans in the same CSS grid cell (`col-start-1 row-start-1` on both,
  // sizing the grid to whichever child is larger). The first is the *final* value rendered
  // `invisible` — kept out of paint but never out of layout — so the grid track is exactly as
  // wide as the finished number from the very first frame. The second is the live, painted digits.
  // Without the invisible sibling, a count from "0" to "379" would grow the box on every tick as
  // digits are added; `tabular-nums` alone only holds each *digit's* width steady, it does nothing
  // about the digit *count* changing. This pairing is the kit's "reserve the final value's width"
  // rule, and it's the reason there are two copies of the same text below instead of one.
  //
  // **`role="img"` is what makes the container-label design actually work, and it is not
  // decoration.** While counting, both copies are `aria-hidden` — the twin because it is invisible,
  // the painted one because it is mid-count and transiently wrong — so the name has to come from
  // `aria-label` on this container. A bare `<span>` has the implicit role `generic`, and ARIA 1.2
  // *prohibits* `aria-label`/`aria-labelledby` on `generic`: Chromium and Gecko both drop it and
  // axe flags `aria-prohibited-attr`. The stat then has **no** accessible number at all, and
  // permanently, because the painted numeral stays `aria-hidden` after it settles. `img` is a role
  // that permits a name from the author, so one attribute restores the name without changing the
  // shape of the design.
  //
  // Deliberately **not** the "sr-only twin" pattern: this repo has a documented trap where an
  // sr-only twin sat *beside* the painted spans and a contrast checker read the invisible copy
  // instead of the visible glyphs, reporting 1:1. Naming the container sidesteps that entirely —
  // there is one source of truth for the accessible name and it is not a rendered node a future
  // tool could pick by mistake.
  //
  // It goes on the **counting box** rather than on the numeral row below, because `role="img"`
  // makes its whole subtree presentational: on the row it would swallow the `sup`/`ordinal`
  // siblings too, and `/teardown` would announce "1000" where the unit is "HP". Scoped here, the
  // image *is* the numeral and the units stay real text beside it.
  const countingBox = (
    <span
      ref={containerRef}
      className="relative inline-grid"
      {...(shouldAnimate ? { role: 'img', 'aria-label': finalText } : {})}
    >
      <span aria-hidden="true" className={cn('invisible col-start-1 row-start-1 tabular-nums')}>
        {finalText}
      </span>
      {shouldAnimate ? (
        // The painted, animating numeral: `aria-hidden` because it is mid-count and therefore
        // transiently wrong. The name comes from this box's own `aria-label` instead.
        <span ref={displayRef} aria-hidden="true" className="col-start-1 row-start-1 tabular-nums">
          0
        </span>
      ) : (
        // Reduced motion (or a non-numeric value): the real, final text, painted and accessible
        // directly — no count ever ran, so there is nothing to hide behind an aria-label.
        <span className="col-start-1 row-start-1 tabular-nums">{finalText}</span>
      )}
    </span>
  );

  return (
    <div className={cn('inline-flex flex-col items-start', className)}>
      {/* The tick bar is purely decorative framing above the numeral; the numeral alone carries
          the stat's meaning. Decorative nodes in this kit are `aria-hidden` *and*
          `pointer-events-none` — the latter even though this one sits in flow rather than
          absolutely positioned, because it is still non-interactive and should never intercept a
          click meant for whatever wraps the stat (a card, a link). Red as a bar is unconstrained:
          the 4.01:1 contrast floor `f1-red` measures on the dark page applies to red *text*. */}
      <div
        aria-hidden="true"
        className={cn('pointer-events-none mb-2 h-1.5 w-5 bg-f1-red', tone?.tick)}
      />
      {/* zinc-400, not zinc-500: at 11px this is small text, so it is held to 4.5:1 on the dark
          page, and zinc-500 measures 4.12:1 there against zinc-400's 7.76:1. Every 11px label on
          this branch is zinc-400 for that reason. `tests/mega-stat.test.tsx` measures the ratio
          with `contrastRatio` rather than pinning the class name. */}
      <span
        className={cn('mb-1 text-[11px] uppercase tracking-[0.2em] text-zinc-400', tone?.label)}
      >
        {label}
      </span>
      <span className={cn('relative inline-flex items-baseline', numeralSizeClass)}>
        <span className={numeralColorClass}>
          {/* `Scribble` wraps `countingBox` — the counted value — and nothing wider. The spec's
              own phrasing draws this line: the mark goes "across the numeral", while the ordinal
              is a separate "chip" next to it (see the Phase 5 example: "1ST" ordinal chip, P1
              scribble "across the numeral"). Wrapping the ordinal/sup or the label/tick bar as
              well would size the mark to a box that includes text a P1 scrawl was never meant to
              cross — a mistake, per the spec's own framing, not a taste call. `countingBox` is
              also the *narrowest correct* choice for another reason: it is exactly the box whose
              width is already reserved for the final value (see the comment above it), so handing
              it to `Scribble` can never introduce a second, competing box whose size might shift
              independently of the CLS guard already in place.

              **`Scribble` is rendered unconditionally, and that is a fix rather than a
              simplification.** It used to be `scribble ? <Scribble>{box}</Scribble> : box`, which
              makes the element *type* at this position depend on a prop — so a call site that
              turns the mark on and off (`/teams` gives it to the championship leader alone)
              changes the tree shape above `countingBox` on every swap, and React unmounts and
              rebuilds the box rather than updating it. The rebuilt painted span re-renders with
              its literal `0` child, so the numeral this component exists to show drops to zero
              mid-swap while the spring — which lives on `MegaStat` itself and never remounted —
              carries on from the old total. That is the same defect the panel's `hoist` fixed for
              the other ten transitions, surviving on the eleventh through this ternary.

              Rendering the element always makes the shape constant; `SCRIBBLE_WITHHELD` is what
              keeps the *mark* conditional, so no non-leader gains a scribble and the leader's is
              untouched. */}
          <Scribble
            type={scribble ?? SCRIBBLE_PLACEHOLDER}
            className={cn(scribbleClassName, !scribble && SCRIBBLE_WITHHELD)}
          >
            {countingBox}
          </Scribble>
          {/* Superscripts sit outside the counting box entirely, as siblings sharing the
              parent's font-size — so a re-render of the counting digits above can never touch
              them, and their `em` sizing resolves against the numeral's own giant font-size
              rather than the page default. */}
          {/* An element `ordinal` is rendered verbatim: see `MegaStatProps` — the `<sup>` treatment
              is what a caller passing a chip is trying to escape, so applying it anyway would make
              the widened type useless. A string keeps the raised suffix it has always had. */}
          {ordinal ? (
            isValidElement(ordinal) ? (
              ordinal
            ) : (
              <sup className="align-super text-[0.35em]">{ordinal}</sup>
            )
          ) : null}
          {sup ? <sup className="align-super text-[0.35em]">{sup}</sup> : null}
        </span>
      </span>
    </div>
  );
}
