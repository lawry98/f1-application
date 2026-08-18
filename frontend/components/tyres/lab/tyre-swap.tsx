'use client';

import { AnimatePresence, motion, type Transition, type Variants } from 'motion/react';

import type { RaceCompound } from '@/data/tyres-data';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

import { TyrePhoto } from './tyre-photo';

export type SwapVariant = 'dissolve' | 'rack' | 'spin';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * The three swap treatments, as motion variants.
 *
 * `custom` carries the travel direction (+1 for a softer compound, -1 for a harder one) so the
 * directional treatments know which way the range is moving. It is threaded through
 * `AnimatePresence custom` as well as the child, because the **exiting** element re-reads custom
 * at exit time — without it on the parent, the outgoing tyre always leaves the way the first one
 * did and the swap stops reading as directional after the first click.
 */
const SWAPS: Record<SwapVariant, { variants: Variants; transition: Transition }> = {
  /**
   * 1 — Dissolve. Product-photography calm: the outgoing tyre settles back and dissolves while
   * the incoming one rises to meet it. The two overlap for most of the duration, so there is
   * never an empty frame.
   */
  dissolve: {
    variants: {
      enter: { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
      center: { opacity: 1, scale: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, scale: 1.06, filter: 'blur(14px)' },
    },
    transition: { duration: 0.62, ease: EASE_OUT_EXPO },
  },

  /**
   * 2 — Rack. The tyres live on a rail and you are sliding along it: the outgoing tyre leaves
   * towards the compound you came from and the incoming one arrives from the compound you are
   * going to. The displacement is what tells you *where in the range* you now are, which a
   * crossfade cannot say.
   */
  rack: {
    variants: {
      enter: (d: number) => ({ opacity: 0, x: 130 * d, scale: 0.86, rotate: 8 * d }),
      center: { opacity: 1, x: 0, scale: 1, rotate: 0 },
      exit: (d: number) => ({ opacity: 0, x: -130 * d, scale: 0.86, rotate: -8 * d }),
    },
    transition: { duration: 0.66, ease: EASE_OUT_EXPO },
  },

  /**
   * 3 — Spin. A wheel change: the outgoing tyre spins down and away, the incoming one spins in
   * against it and settles. The counter-rotation is the point — both turning the same way reads
   * as one tyre changing colour rather than as two tyres being swapped.
   */
  spin: {
    variants: {
      enter: (d: number) => ({ opacity: 0, rotate: -150 * d, scale: 0.55 }),
      center: { opacity: 1, rotate: 0, scale: 1 },
      exit: (d: number) => ({ opacity: 0, rotate: 150 * d, scale: 0.55 }),
    },
    transition: { duration: 0.78, ease: EASE_OUT_EXPO },
  },
};

export interface TyreSwapProps {
  compound: RaceCompound;
  /** +1 when moving towards a softer compound, -1 towards a harder one. */
  direction: number;
  /**
   * Chosen treatment. Defaults to `rack` — the directional one — because it is the only variant
   * that encodes *position in the range*, and hard-to-soft ordering is the thing this page exists
   * to teach. The other two stay reachable for a surface where ordering is not the point.
   */
  variant?: SwapVariant;
  sizes?: string;
  className?: string;
}

/**
 * A compound render that animates when it changes.
 *
 * Both tyres are absolutely positioned inside a square box so they can **overlap** during the
 * swap. That is the whole reason this is not `AnimatePresence mode="wait"`: `wait` holds the
 * incoming child until the outgoing one has finished, which leaves an empty frame in the middle
 * of the transition and makes a 600ms swap feel like a 1.2s stall.
 *
 * The box is `aspect-square` and sized by its parent, so the height never depends on whether an
 * image has loaded — all five renders are 1200x1200, and reserving the square is what keeps this
 * at zero layout shift.
 */
export function TyreSwap({
  compound,
  direction,
  variant = 'rack',
  sizes = '(max-width: 768px) 82vw, 40vw',
  className,
}: TyreSwapProps) {
  const reduced = useReducedMotionSafe();
  const swap = SWAPS[variant];

  return (
    <div className={cn('relative aspect-square w-full', className)}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={compound.id}
          className="absolute inset-0"
          custom={direction}
          variants={
            reduced
              ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
              : swap.variants
          }
          initial="enter"
          animate="center"
          exit="exit"
          // Reduced motion keeps the *fact* of a transition — a short cross-fade — and drops
          // every displacement, rotation and scale. An instant cut is more disorienting than a
          // fade, and a fade implies no self-motion, so it is not what the preference is asking
          // to be spared.
          transition={reduced ? { duration: 0.16, ease: 'linear' } : swap.transition}
          style={{ transformOrigin: '50% 50%' }}
        >
          <TyrePhoto compound={compound} sizes={sizes} priority />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const SWAP_LABELS: Record<SwapVariant, { name: string; blurb: string }> = {
  dissolve: {
    name: '1 · Dissolve',
    blurb:
      'Product-photography calm. The outgoing tyre settles back and blurs out while the incoming one rises through it. Quietest of the three; nothing ever moves sideways.',
  },
  rack: {
    name: '2 · Rack slide',
    blurb:
      'Directional. The tyre leaves towards the compound you came from and arrives from the one you picked, with a slight roll. The displacement tells you where in the range you now are.',
  },
  spin: {
    name: '3 · Wheel change',
    blurb:
      'Mechanical. The old tyre spins down and away, the new one counter-spins in and settles. The most motorsport of the three, and the most theatrical.',
  },
};
