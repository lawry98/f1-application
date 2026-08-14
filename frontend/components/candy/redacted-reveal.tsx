'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

/** 650ms out-expo wipe, per the spec. */
const WIPE_DURATION_S = 0.65;
/** The final 150ms of the wipe is also when the content fades in — see `barOffsetPx` below. */
const FADE_DURATION_S = 0.15;
/** 100ms staircase between one line's bar starting and the next's. */
const LINE_STAGGER_S = 0.1;
/** `ease-out-expo` as a JS easing array — `tailwind.config.ts`'s `out-expo` is CSS-only. */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
/**
 * Every scroll-triggered instance in this kit fires **once**, at this margin — `MegaStat`,
 * `Scribble` and `LaurelFlourish` all repeat the same pair. A bar that re-wipes every time its
 * line scrolls back past reads as a glitch rather than as a reveal.
 */
const ONCE_IN_VIEW = { once: true, margin: '-15% 0px' } as const;

/**
 * Per-line bar geometry, derived from the line's index rather than `Math.random()`.
 *
 * Landonorris.com's stacked reveal bars are each a slightly different size — that's what
 * keeps several still bars reading as an uneven stack instead of one solid redaction box
 * before they wipe. Randomising this per render would be a hydration mismatch on every page
 * that uses the effect, exactly the trap `TopoBackground`'s `CONTOURS` comment documents and
 * fixes with a fixed table; here there's no fixed table because the number of lines isn't
 * known ahead of time, so the "randomness" is a multiply-and-mod permutation instead. Plain
 * `index % 9` would also be deterministic, but it counts up in lockstep (0, 1, 2, 3, …) and
 * reads as a ramp rather than a wobble; multiplying by a factor coprime with the modulus
 * still visits every value over one period, just out of order, which is what actually looks
 * irregular.
 */
function barWidthPercent(index: number): number {
  // 100–108% of the line's own width.
  return 100 + ((index * 4) % 9);
}

function barOffsetPx(index: number): number {
  // -3..3px, a different coprime pair so the offset doesn't track the width 1:1.
  return ((index * 5) % 7) - 3;
}

export interface RedactedRevealProps {
  children: React.ReactNode;
  /** Bar colour. 'accent' is f1-red (the loud default), 'ink' the quieter off-white. */
  variant?: 'accent' | 'ink';
  /** Seconds added before this instance's first bar starts to wipe. */
  delay?: number;
  /** Element rendered for each line. */
  as?: React.ElementType;
  trigger?: 'onView' | 'immediate';
  className?: string;
}

/**
 * The site-defining reveal: a redaction bar sits over each line of text and wipes away on
 * scroll (or on mount, for the streaming use case), uncovering the line as it retracts.
 *
 * **Every top-level child is its own line, each with its own bar.** `React.Children.toArray`
 * is what makes the multi-line "staircase" possible — a single child (the common case, e.g.
 * one stat value) still goes through the same path and produces exactly one line, so there is
 * only one code path to keep correct rather than a single/multi special case.
 *
 * **The line wrapper is `inline-block`, not the default flow of `as`.** The bar is sized in
 * percent relative to its positioning parent, so the parent has to shrink-wrap the content —
 * if it stayed the block-level default (e.g. a bare `<h1>` spanning a whole column) the bar
 * would cover the column's full width instead of just the glyphs, and short lines would sit
 * under a bar many times wider than the text.
 *
 * **Content is a separate `motion.span` from the bar, not a CSS consequence of the bar
 * leaving.** The spec calls for the text to fade in over the final 150ms of the bar's own
 * wipe — i.e. the reveal is *timed to* the bar's departure, not merely *caused* by it (the
 * bar is `pointer-events-none` and never opaque-masks in a way that would hide unstyled text
 * underneath anyway). Two independently timed animations sharing one `delay` base is what
 * lets both requirements — "wipes over 650ms" and "text fades over the final 150ms" — hold at
 * once.
 *
 * **The reduced-motion branch must come from `useReducedMotionSafe`, never from motion's own
 * `useReducedMotion`. This is the file that proved it.** motion's hook reads a module-level store
 * that only the browser initialises, so it answers `null` during SSR and the user's *real*
 * preference on the client's very first render. Any component that branches which *elements* it
 * returns on that value therefore emits one tree on the server and a different one on the client's
 * first pass — a hydration mismatch. Reproduced in Chromium under emulated reduced motion on `/`:
 *
 *     Warning: Expected server HTML to contain a matching text node for "Race weekend" in <span>
 *         at RedactedReveal (components/candy/redacted-reveal.tsx)
 *
 * It is invisible unless reduced motion is actually emulated, which is how four components in this
 * kit shipped with it: without the preference set, server and client agree on "no preference" by
 * accident. `useReducedMotionSafe` returns `false` on the server and on the first client render,
 * then flips in a *layout* effect so the corrected tree commits before paint — see
 * `hooks/use-reduced-motion-safe.ts` for why a mounted flag rather than a structural rewrite, and
 * why layout timing rather than `useEffect`. `mega-stat.tsx`, `scribble.tsx` and
 * `laurel-flourish.tsx` branch structurally too and point back here.
 *
 * Motion's own hook stays correct for feeding an animation *value*, which never reaches the SSR
 * markup. Nothing in this file does that: the preference here decides whether the bar element
 * exists at all.
 */
export function RedactedReveal({
  children,
  variant = 'accent',
  delay = 0,
  as: Component = 'span',
  trigger = 'onView',
  className,
}: RedactedRevealProps) {
  const prefersReducedMotion = useReducedMotionSafe();
  const lines = React.Children.toArray(children);
  // `bg-f1-red`, not the `bg-brand` alias of the identical hex this used to carry. They render the
  // same; the point is that a `grep f1-red` audit — which this branch's own commits run — finds
  // the site-defining reveal bar instead of silently missing it.
  const barColorClassName = variant === 'ink' ? 'bg-ink' : 'bg-f1-red';

  return (
    <>
      {lines.map((line, index) => {
        const lineDelay = delay + index * LINE_STAGGER_S;
        /*
         * `React.Children.toArray` assigns every *element* child a key, and it preserves one the
         * caller supplied, so using it here means a call site that reorders its lines keeps each
         * line's identity — and its in-flight bar animation — attached to the right line. A bare
         * string or number child cannot carry a key, so those fall back to their position, which
         * is safe for the only thing that produces them: a heading's lines written out literally
         * rather than mapped from data that can reorder.
         */
        const lineKey =
          React.isValidElement(line) && line.key !== null ? line.key : `line-${index}`;

        if (prefersReducedMotion) {
          // The kit's reduced-motion rule is "render the static *final* state immediately, with
          // no transition" — not a frozen initial state. The end state of this effect is bar
          // gone, text fully visible, so that is a line with no bar element at all rather than a
          // bar animated to its resting scale. Never gate the child on the animation: it is the
          // same node the motion branch renders, just without the motion wrapper around it.
          return (
            <Component key={lineKey} className={cn('relative inline-block', className)}>
              {line}
            </Component>
          );
        }

        const width = barWidthPercent(index);
        const offset = barOffsetPx(index);
        // The content fade starts `WIPE_DURATION_S - FADE_DURATION_S` after the bar itself
        // starts, so it always lands in the bar's final 150ms regardless of `lineDelay`.
        const fadeDelay = lineDelay + (WIPE_DURATION_S - FADE_DURATION_S);

        return (
          <Component key={lineKey} className={cn('relative inline-block', className)}>
            {/* Content: plain in the DOM from first render; only its opacity is animated. */}
            <motion.span
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={trigger === 'immediate' ? { opacity: 1 } : undefined}
              whileInView={trigger === 'onView' ? { opacity: 1 } : undefined}
              viewport={trigger === 'onView' ? ONCE_IN_VIEW : undefined}
              transition={{ duration: FADE_DURATION_S, ease: EASE_OUT_EXPO, delay: fadeDelay }}
            >
              {line}
            </motion.span>
            {/* The redaction bar. Absolutely positioned over the line above, so it never
                affects the line's layout — CLS stays 0 whichever state it's in. */}
            <motion.span
              aria-hidden="true"
              className={cn('pointer-events-none absolute inset-y-0', barColorClassName)}
              style={{ right: `${offset}px`, width: `${width}%`, transformOrigin: 'right' }}
              initial={{ scaleX: 1 }}
              animate={trigger === 'immediate' ? { scaleX: 0 } : undefined}
              whileInView={trigger === 'onView' ? { scaleX: 0 } : undefined}
              viewport={trigger === 'onView' ? ONCE_IN_VIEW : undefined}
              transition={{ duration: WIPE_DURATION_S, ease: EASE_OUT_EXPO, delay: lineDelay }}
            />
          </Component>
        );
      })}
    </>
  );
}
