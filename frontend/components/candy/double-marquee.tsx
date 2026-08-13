'use client';

import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Shared type sizing and line-height for both rows.
 *
 * `text-[7vw]` matches the spec's "~7vw" for both lines. At that size the font's default
 * line-height leaves visible daylight between the two rows — enough that they read as two
 * unrelated headlines stacked by accident rather than one two-line statement ("lights out" /
 * "AND AWAY WE GO" belong together). `leading-[0.85]` pulls them back into a pair without
 * clipping either line's ascenders/descenders, which `leading-none` (1) started to do on the
 * serif italic's descenders.
 */
const LINE_SIZE = 'text-[7vw] leading-[0.85]';

/**
 * The animation classes come from `tailwind.config.ts` and must not be redefined here.
 *
 * Both keyframes assume a track that is exactly **twice** its viewport's width — holding the
 * line's content twice over — because translating that track by exactly `-50%` lands the second
 * copy precisely where the first one started, so the loop point is invisible. `MarqueeLine`
 * below is the half of that contract this file owns: it must render the content exactly twice,
 * as equal-width siblings, or the `-50%` in the keyframe stops lining up with "half the track"
 * and the seam jumps. Do not "simplify" this to one copy plus `animation-direction: alternate`;
 * that produces a bounce, not a loop.
 *
 * The two rows are assigned opposite directions (not because the spec requires *which* row goes
 * which way, only that they differ) so the pair reads as counter-rotating, the way a diptych of
 * independent headlines should, rather than as one banner sliding as a block.
 */
const TOP_ANIMATION = 'animate-marquee-left';
const BOTTOM_ANIMATION = 'animate-marquee-right';

/** Gap rendered after each copy of a line's text, so the two copies don't run together at the seam. */
const COPY_GAP = 'pr-[4vw]';

interface MarqueeLineProps {
  text: string;
  animationClass: string;
  paused: boolean;
  textClassName: string;
}

/**
 * One marquee row: a fixed-width viewport clipping a track that is twice as wide as it is.
 *
 * The viewport (`overflow-hidden`) is what turns "a track twice the width, half off-screen"
 * into "a line of text that appears to scroll forever" — without it the second copy would just
 * sit visibly to the right of the first.
 *
 * The track itself must resolve to `w-max` (shrink-to-fit its two children) rather than
 * `w-full`: a `w-full` track would be stuck at the viewport's width, so `-50%` would translate
 * by only half of *that*, not half of the doubled content, and the loop would show a visible
 * jump. `whitespace-nowrap` on the same element is what stops a long `bottomText` from wrapping
 * onto a second line inside its own copy, which would give the track an unstable height and
 * break the assumption that both copies are identical single-line blocks.
 */
function MarqueeLine({ text, animationClass, paused, textClassName }: MarqueeLineProps) {
  return (
    <div className="w-full overflow-hidden">
      <div
        className={cn(
          'flex w-max whitespace-nowrap',
          // Reduced motion: dropping the animation class (rather than swapping to a 0-duration
          // one) is the static final state the spec asks for. The doubled content stays in the
          // tree either way — see the note on DoubleMarquee below for why that's deliberate.
          !paused && animationClass,
        )}
      >
        {/* Two identical children, not a `.map` over `[0, 1]` — a `key` per the a11y note in
            DoubleMarquee, and identical markup so both copies are the same width, which is the
            geometric assumption the `-50%` keyframe depends on. */}
        <span key="first" className={cn('shrink-0', COPY_GAP, textClassName)}>
          {text}
        </span>
        <span key="second" className={cn('shrink-0', COPY_GAP, textClassName)}>
          {text}
        </span>
      </div>
    </div>
  );
}

export interface DoubleMarqueeProps {
  topText: string;
  bottomText: string;
  className?: string;
}

/**
 * Two full-bleed lines of text scrolling in opposite directions, forever.
 *
 * Purely decorative: the two rows exist to *look* like a ticker, not to communicate anything a
 * screen reader should announce, and each row already repeats its own text — reading it aloud
 * would say every word twice for no reason. Hence `aria-hidden="true"` on the whole component
 * (not just each row) and `pointer-events-none` (a moving strip of text should never intercept
 * the click of whatever real content sits in the same band).
 *
 * Under reduced motion, the component still renders both rows with both text copies in the DOM
 * — `paused` only removes the animation class from each track (see `MarqueeLine`). The spec
 * calls the duplicate "redundant but harmless" once the motion stops, and that's the right
 * trade: keeping the tree identical between the animated and static branches means there is only
 * one structure to reason about (and to test), for the cost of one invisible extra text node.
 */
export function DoubleMarquee({ topText, bottomText, className }: DoubleMarqueeProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className={cn('pointer-events-none w-full', className)}>
      <MarqueeLine
        text={topText}
        animationClass={TOP_ANIMATION}
        paused={!!reduceMotion}
        // Quieter of the two — the serif italic is the accent voice, not the headline.
        textClassName={cn(LINE_SIZE, 'font-serif-display italic text-zinc-600')}
      />
      <MarqueeLine
        text={bottomText}
        animationClass={BOTTOM_ANIMATION}
        paused={!!reduceMotion}
        textClassName={cn(LINE_SIZE, 'font-display uppercase tracking-tight text-ink')}
      />
    </div>
  );
}
