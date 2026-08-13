'use client';

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
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

/** Every scroll-triggered instance in the kit fires once, this margin, per SHARED.md. */
const ONCE_IN_VIEW = { once: true, margin: '-15% 0px' } as const;

/**
 * Why this isn't built on `components/ui/number-ticker.tsx`, even though it does a spring count-up
 * over the same `useMotionValue`/`useSpring` primitives:
 *
 * 1. It never calls `useReducedMotion()`. Its spring still runs full-length under a reduced-motion
 *    preference, which is exactly the failure this kit's spec forbids — reduced motion has to
 *    render the *final* value with no count, not merely a fast one.
 * 2. It renders `startValue` (`0`) as the element's only child, so the box is exactly as wide as
 *    "0" on first paint and grows with every digit added — a CLS trap `SHARED.md` names as the
 *    single most important detail of this component. Nothing in that component reserves the final
 *    digit count's width up front.
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
  /** Raised ordinal suffix, e.g. 'ST' | 'ND' | 'TH'. */
  ordinal?: string;
  /** Raised trailing fragment, e.g. '.909' on a lap time, or '%'. */
  sup?: string;
  /** Overlays a Scribble across the numeral. Used for P1 moments. */
  scribble?: ScribbleType;
  /** 'mega' is the .text-mega display scale; 'mid' the clamp(2.5rem, 6vw, 4.5rem) variant. */
  scale?: 'mega' | 'mid';
  className?: string;
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
  scale = 'mega',
  className,
}: MegaStatProps): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
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
  const numeralColorClass = 'font-display text-ink';

  // The counting box: two spans in the same CSS grid cell (`col-start-1 row-start-1` on both,
  // sizing the grid to whichever child is larger). The first is the *final* value rendered
  // `invisible` — kept out of paint but never out of layout — so the grid track is exactly as
  // wide as the finished number from the very first frame. The second is the live, painted digits.
  // Without the invisible sibling, a count from "0" to "379" would grow the box on every tick as
  // digits are added; `tabular-nums` alone only holds each *digit's* width steady, it does nothing
  // about the digit *count* changing. This pairing is what SHARED.md's "reserve the final value's
  // width" note is describing, and it's the reason there are two copies of the same text below
  // instead of one.
  const countingBox = (
    <span ref={containerRef} className="relative inline-grid">
      <span aria-hidden="true" className={cn('invisible col-start-1 row-start-1 tabular-nums')}>
        {finalText}
      </span>
      {shouldAnimate ? (
        // The painted, animating numeral. `aria-hidden` because it is mid-count and therefore
        // transiently wrong; the accessible name for this whole stat comes from `aria-label`
        // below instead of from this node's text. (Deliberately not the "sr-only twin" pattern —
        // this repo has a documented trap where a sr-only twin sits *beside* the painted spans and
        // a contrast checker read the invisible one instead of the visible one. Putting the label
        // on the container sidesteps that shape of bug entirely: there is only one source of truth
        // for the accessible name, and it isn't a rendered node a future tool could pick by
        // mistake.)
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
      {/* The tick bar and label are purely decorative framing above the numeral; the numeral
          alone carries the stat's meaning. `pointer-events-none` per SHARED.md's decorative-
          overlay rule, even though it sits in flow rather than absolutely positioned — it is
          still non-interactive and should never intercept a click meant for whatever wraps this
          stat (a card, a link). */}
      <div aria-hidden="true" className="pointer-events-none mb-2 h-1.5 w-5 bg-f1-red" />
      {/* zinc-400, not zinc-500 — SHARED.md's contrast note: only zinc-400 clears 4.5:1 on `base`
          at 11px. */}
      <span className="mb-1 text-[11px] uppercase tracking-[0.2em] text-zinc-400">{label}</span>
      <span
        className={cn('relative inline-flex items-baseline', numeralSizeClass)}
        // Only set while the digits themselves are mid-count and unreliable — see the comment on
        // the painted span above.
        {...(shouldAnimate ? { 'aria-label': finalText } : {})}
      >
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
              independently of the CLS guard already in place. */}
          {scribble ? <Scribble type={scribble}>{countingBox}</Scribble> : countingBox}
          {/* Superscripts sit outside the counting box entirely, as siblings sharing the
              parent's font-size — so a re-render of the counting digits above can never touch
              them, and their `em` sizing resolves against the numeral's own giant font-size
              rather than the page default. */}
          {ordinal ? <sup className="align-super text-[0.35em]">{ordinal}</sup> : null}
          {sup ? <sup className="align-super text-[0.35em]">{sup}</sup> : null}
        </span>
      </span>
    </div>
  );
}
