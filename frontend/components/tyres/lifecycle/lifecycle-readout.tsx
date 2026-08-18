'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';

import { cn } from '@/lib/utils';

import { THERMAL_DOT, THERMAL_LABEL, type ThermalState } from './lifecycle-data';
import {
  EASE_OUT_EXPO,
  LIFECYCLE_TIMING,
  contentTransition,
  contentVariants,
  reducedContentVariants,
} from './lifecycle-motion';

/**
 * The tyre's readout — the HUD beneath the sticky photograph.
 *
 * It is `aria-hidden` on purpose: every fact it shows (stage number, name, wear, thermal) is also
 * in the active stage card, which is real reading-order content. This is the sighted echo that
 * lets the tyre act like an instrument — the concise content that swaps with the house exit-up /
 * enter-below choreography, the wear meter that eases to its exact value, the completion mark.
 * Duplicating it into the accessibility tree would only make a screen reader read every stage
 * twice, so it does not.
 */

export interface LifecycleReadoutProps {
  activeIndex: number;
  total: number;
  direction: number;
  stageName: string;
  wearPct: number;
  thermal: ThermalState;
  reduced: boolean;
}

export function LifecycleReadout({
  activeIndex,
  total,
  direction,
  stageName,
  wearPct,
  thermal,
  reduced,
}: LifecycleReadoutProps) {
  const complete = activeIndex === total - 1;

  return (
    <div aria-hidden="true" className="mt-5 lg:mt-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
        {`Stage ${activeIndex + 1} / ${total}`}
      </p>

      {/* The concise name, entering from below (forward) or above (back) as the stage changes.
          A keyed re-mount rather than AnimatePresence: the outgoing name is removed the instant the
          new one mounts, so a fast scroll through several stages can never leave two names stacked —
          only the newest is ever in the DOM. `overflow-hidden` clips the entering slide. */}
      <div className="mt-1.5 h-8 overflow-hidden sm:h-9">
        <motion.p
          key={activeIndex}
          custom={direction}
          variants={reduced ? reducedContentVariants : contentVariants}
          initial="enter"
          animate="center"
          transition={contentTransition(reduced)}
          className="truncate font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-[1.65rem]"
        >
          {stageName}
        </motion.p>
      </div>

      {/* Wear meter — the bar eases to width, the counter to its value. */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          <span>Wear</span>
          <span>
            <WearCounter value={wearPct} reduced={reduced} />%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-f1-red"
            initial={false}
            animate={{ width: `${wearPct}%` }}
            transition={
              reduced
                ? { duration: LIFECYCLE_TIMING.reduced }
                : { duration: LIFECYCLE_TIMING.counter, ease: EASE_OUT_EXPO }
            }
          />
        </div>
      </div>

      {/* Thermal + completion. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-zinc-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: THERMAL_DOT[thermal] }}
          />
          {THERMAL_LABEL[thermal]}
        </span>
        <AnimatePresence>
          {complete && (
            <motion.span
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: LIFECYCLE_TIMING.reduced } : { duration: 0.45, ease: EASE_OUT_EXPO }}
              className="inline-flex items-center gap-1.5 rounded-full border border-f1-red/50 bg-f1-red/10 px-3 py-1 text-[11px] font-semibold text-zinc-200"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-f1-red" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Full lifecycle
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * A whole-number counter that eases toward its value, written straight to the DOM node so it never
 * re-renders React on a frame. It is inside an `aria-hidden` tree, so the animation is never
 * announced — the exact figure lives in the active card's state label.
 */
function WearCounter({ value, reduced }: { value: number; reduced: boolean }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);

  useEffect(() => {
    const node = spanRef.current;
    if (!node) return;
    if (reduced) {
      mv.set(value);
      node.textContent = String(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: LIFECYCLE_TIMING.counter,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduced, mv]);

  return (
    <span ref={spanRef} className={cn('tabular-nums')}>
      {value}
    </span>
  );
}
