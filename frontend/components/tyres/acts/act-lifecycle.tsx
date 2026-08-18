'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useScroll, useTransform } from 'motion/react';

import { useLifecycleActiveStage } from '@/hooks/use-lifecycle-active-stage';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { EYEBROW_RED } from '@/lib/tyre-utils';

import {
  LIFECYCLE,
  LIFECYCLE_COUNT,
  wearPercent,
} from '../lifecycle/lifecycle-data';
import {
  ROTATION_TOTAL_DEG,
  WEAR_STOPS,
  WEAR_VALUES,
} from '../lifecycle/lifecycle-motion';
import { LifecycleReadout } from '../lifecycle/lifecycle-readout';
import { LifecycleStageCard } from '../lifecycle/lifecycle-stage-card';
import { LifecycleStepper } from '../lifecycle/lifecycle-stepper';
import { LifecycleTyre } from '../lifecycle/lifecycle-tyre';

/**
 * Act 4 — the life of a tyre, as a guided sticky-scroll story.
 *
 * The eight stages live in normal document flow on the right; a single Pirelli photograph stays
 * pinned on the left and ages as the reader scrolls — heating, wearing, scuffing and cooling
 * between the stages' own wear values. The active stage is whichever card is nearest the activation
 * line, and it drives the HUD, the stepper and the discrete heat treatment; the continuous wear and
 * the rotation are `MotionValue`s off scroll progress, so nothing re-renders per pixel.
 *
 * Nothing here scroll-jacks: the page's own scrollbar stays in control, and the cards are complete,
 * readable content with the full sourced detail behind each one's disclosure even with JavaScript
 * off. The drawn-SVG tyre engine (`lab/tyre-body`, `lab/tyre-defs`) is no longer used here but is
 * left intact — `public/tyres/CREDITS.md` keeps it as the licence-clean hero for a public build.
 */
export function ActLifecycle() {
  const reduced = useReducedMotionSafe();
  const { activeIndex, direction, setStageRef, goToStage, announcement } =
    useLifecycleActiveStage(reduced);

  const active = LIFECYCLE[activeIndex] ?? LIFECYCLE[0]!;

  // Continuous wear and rotation from scroll progress across the stage track.
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start 55%', 'end 55%'],
  });
  const scrollWear = useTransform(scrollYProgress, WEAR_STOPS, WEAR_VALUES);
  const scrollRotation = useTransform(scrollYProgress, [0, 1], [0, ROTATION_TOTAL_DEG]);

  // Reduced motion swaps the scroll-linked values for discrete ones: wear steps to the active
  // stage, rotation is held at zero. The rendered tree is identical either way.
  const discreteWear = useMotionValue(active.visual.wear);
  const zeroRotation = useMotionValue(0);
  useEffect(() => {
    if (reduced) discreteWear.set(active.visual.wear);
  }, [reduced, active.visual.wear, discreteWear]);

  const wear = reduced ? discreteWear : scrollWear;
  const rotation = reduced ? zeroRotation : scrollRotation;

  const altText = `Pirelli soft-compound Formula 1 slick, stage ${activeIndex + 1} of ${LIFECYCLE_COUNT}: ${active.stage.name} — ${active.visual.note.toLowerCase()}`;

  return (
    <section
      aria-labelledby="lifecycle-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base"
    >
      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Act 4
        </p>
        <h2
          id="lifecycle-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          The life of a tyre
        </h2>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-zinc-300">
          Scroll to take one tyre from the blankets to the recycler. It heats, wears and cools as you
          go — eight quick stops, and any of them opens for the full detail and its source.
        </p>

        <div
          ref={trackRef}
          className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14"
        >
          {/* The pinned tyre: a compact band on mobile, a tall sticky column on desktop. */}
          <div className="sticky top-14 z-20 -mx-4 self-start border-b border-white/10 bg-base/95 px-4 pb-4 pt-2 backdrop-blur-sm lg:top-24 lg:mx-0 lg:border-b-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
            <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-5">
              <LifecycleTyre
                wear={wear}
                rotation={rotation}
                activeIndex={activeIndex}
                thermal={active.visual.thermal}
                altText={altText}
                reduced={reduced}
                className="w-24 shrink-0 sm:w-28 lg:mx-auto lg:w-full lg:max-w-[18rem]"
              />
              <div className="min-w-0 flex-1">
                <LifecycleReadout
                  activeIndex={activeIndex}
                  total={LIFECYCLE_COUNT}
                  direction={direction}
                  stageName={active.stage.name}
                  wearPct={wearPercent(active.visual.wear)}
                  thermal={active.visual.thermal}
                  reduced={reduced}
                />
              </div>
            </div>
            <LifecycleStepper
              activeIndex={activeIndex}
              total={LIFECYCLE_COUNT}
              onSelect={goToStage}
              reduced={reduced}
            />
          </div>

          {/* The stages, in normal document flow. */}
          <ol className="space-y-6 sm:space-y-8">
            {LIFECYCLE.map((entry, i) => (
              <LifecycleStageCard
                key={entry.stage.id}
                entry={entry}
                index={i}
                total={LIFECYCLE_COUNT}
                isActive={i === activeIndex}
                setRef={setStageRef(i)}
              />
            ))}
          </ol>
        </div>

        {/* Deliberate navigation is announced once, after it settles. Ordinary scrolling is not. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </section>
  );
}
