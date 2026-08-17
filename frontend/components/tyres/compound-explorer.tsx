'use client';

import { useId } from 'react';
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
  type Variants,
} from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { TYRE_GLOW_PEAK } from '@/lib/tyre-utils';
import { useCompoundCarousel } from '@/hooks/use-compound-carousel';
import type { ComparisonGroup, RaceCompound } from '@/data/tyres-data';
import { CompoundTablist } from './compound-tablist';
import { CompoundScene } from './compound-scene';

/* ------------------------------------------------------------------ *
 * Motion
 * ------------------------------------------------------------------ */

/**
 * How far the middle layer travels, in px.
 *
 * A distance, not a percentage: at 390px wide a percentage-based slide either barely moves or
 * throws the copy off screen, and the same number has to read correctly from a phone to a
 * 1440px desktop. 56px is far enough to be unambiguously directional and short enough that
 * the eye never loses the object.
 */
export const SCENE_TRAVEL_PX = 56;

/** The tyre is the subject, so it travels furthest; the wordmark is the far plane. */
export const TYRE_TRAVEL_FACTOR = 1.6;
export const WORDMARK_TRAVEL_FACTOR = 0.35;

/** Critically damped, per the house style — bounce is reserved for the drag release. */
const SPRING = { type: 'spring', duration: 0.42, bounce: 0 } as const;
/** Tier 2 under reduced motion: keep the fact of a transition, drop the displacement. */
const CROSSFADE = { duration: 0.18, ease: 'easeOut' } as const;

interface DirectionalFrame {
  x: number;
  opacity: number;
  transition?: Record<string, unknown> & { duration: number };
}

export interface DirectionalVariants {
  enter: (direction: number) => DirectionalFrame;
  center: DirectionalFrame & { transition: Record<string, unknown> & { duration: number } };
  exit: (direction: number) => DirectionalFrame;
}

/**
 * Resting opacity of the background wordmark.
 *
 * This has to be carried by the **variant**, not by an `opacity-[…]` class: the variants set
 * `opacity` inline as part of the fade, so a class would be overwritten the moment the scene
 * settled — which is precisely how the wordmark first shipped, rendering at full strength and
 * looking like solid white type rather than a ghost.
 */
export const WORDMARK_OPACITY = 0.1;

function travelVariants(
  reducedMotion: boolean,
  factor: number,
  peakOpacity = 1,
): DirectionalVariants {
  const travel = reducedMotion ? 0 : SCENE_TRAVEL_PX * factor;
  const transition = reducedMotion ? CROSSFADE : SPRING;
  // Guarded so a zero travel yields `0` and not `-0`. Harmless to render, but `-0` in a
  // variant is the kind of thing that reads as a bug in a diff and fails an `Object.is`
  // assertion that is otherwise saying exactly the right thing.
  const offset = (sign: number) => (travel === 0 ? 0 : sign * travel);
  return {
    // Forward: the new compound arrives from the right, the old one leaves to the left.
    // Exit mirrors enter exactly, so what left to the left returns from the left.
    enter: (direction: number) => ({ x: offset(direction), opacity: 0 }),
    center: { x: 0, opacity: peakOpacity, transition },
    exit: (direction: number) => ({ x: offset(-direction), opacity: 0, transition }),
  };
}

/** The copy layer, and the variant labels every other layer inherits. */
export function panelVariants(reducedMotion: boolean): DirectionalVariants {
  return travelVariants(reducedMotion, 1);
}

export function tyreVariants(reducedMotion: boolean): DirectionalVariants {
  return travelVariants(reducedMotion, TYRE_TRAVEL_FACTOR);
}

export function wordmarkVariants(reducedMotion: boolean): DirectionalVariants {
  return travelVariants(reducedMotion, WORDMARK_TRAVEL_FACTOR, WORDMARK_OPACITY);
}

/* ------------------------------------------------------------------ *
 * Swipe
 * ------------------------------------------------------------------ */

/** How far a drag must end up before it counts as a deliberate move. */
export const SWIPE_COMMIT_PX = 60;

/**
 * Apple's momentum projection from *Designing Fluid Interfaces* — exponential decay, not the
 * textbook `v²/2a`. It answers "where would this have come to rest?", which is the question a
 * flick actually asks.
 */
const DECELERATION = 0.998;
function project(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

/**
 * Which way a finished drag should move the scene: `1` forward, `-1` back, `0` snap home.
 *
 * Distance alone is not enough. A short, fast flick covers 30px and unmistakably means
 * "next"; a slow 30px drag means "I changed my mind". Projecting the release velocity forward
 * and testing the *projected* endpoint handles both with one threshold, and lets a flick back
 * the other way override the distance already travelled.
 */
export function commitFromDrag(offsetX: number, velocityX: number): -1 | 0 | 1 {
  const projected = offsetX + project(velocityX);
  if (projected <= -SWIPE_COMMIT_PX) return 1;
  if (projected >= SWIPE_COMMIT_PX) return -1;
  return 0;
}

/** How far the scene rubber-bands under the finger while being dragged. */
export const DRAG_ELASTIC = 0.14;

/**
 * The drag's elasticity, which is how reduced motion is honoured for the swipe.
 *
 * Swipe stays *enabled* under reduced motion and only its displacement goes to zero. Two
 * reasons. The gesture is direct manipulation the user is performing themselves, not
 * autonomous motion, so removing it would take away a control rather than a hazard — and
 * taking it away would mean rendering a different element on the server than on the client,
 * which is a hydration mismatch by construction, because `useReducedMotion()` cannot know the
 * answer during SSR. Elasticity is a behavioural prop that never reaches the DOM, so varying
 * it is free.
 */
export function dragElasticFor(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DRAG_ELASTIC;
}

/* ------------------------------------------------------------------ *
 * Explorer
 * ------------------------------------------------------------------ */

interface CompoundExplorerProps {
  compounds: (RaceCompound & { comparisonGroup: ComparisonGroup })[];
  reducedMotion: boolean;
}

/**
 * The page's centrepiece: one compound at a time, changing as a single composed scene.
 *
 * Everything animated here reads `direction` from `useCompoundCarousel`, so the tyre, the
 * copy and the background wordmark cannot disagree about which way the scene is moving —
 * which is the difference between a composed transition and several unrelated ones.
 *
 * There is deliberately **no autoplay**. WCAG 2.2.2 would require a pause control for any
 * auto-motion over five seconds, and an explainer nobody asked to be advanced through is
 * worse than one that waits.
 */
export function CompoundExplorer({ compounds, reducedMotion }: CompoundExplorerProps) {
  const uid = useId().replace(/:/g, '');
  const { index, direction, select, next, previous } = useCompoundCarousel(compounds.length);
  const dragControls = useDragControls();
  const compound = compounds[index];

  // `compounds` is a module constant today, but a caller that filtered it to nothing would
  // otherwise crash on `compound.id` rather than render nothing.
  if (!compound) return null;

  const tabId = (id: string) => `${uid}-tab-${id}`;
  const panelId = (id: string) => `${uid}-panel-${id}`;

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    const move = commitFromDrag(info.offset.x, info.velocity.x);
    if (move === 1) next();
    if (move === -1) previous();
  };

  const scene = (
    <AnimatePresence initial={false} custom={direction}>
      <CompoundScene
        key={compound.id}
        compound={compound}
        direction={direction}
        variants={panelVariants(reducedMotion) as unknown as Variants}
        onDragHandlePointerDown={(event) => dragControls.start(event)}
        tyreVariants={tyreVariants(reducedMotion) as unknown as Variants}
        wordmarkVariants={wordmarkVariants(reducedMotion) as unknown as Variants}
        id={panelId(compound.id)}
        labelledBy={tabId(compound.id)}
      />
    </AnimatePresence>
  );

  return (
    // `isolate` is load-bearing, not decoration. The glow below is `-z-10`, and without a
    // stacking context here it paints *behind the section's own* `bg-zinc-950` and is invisible
    // — which is exactly how it shipped the first time. `isolation: isolate` scopes the negative
    // layer to this subtree, so it lands above the page background and below the content.
    <div className="relative isolate">
      {/*
       * The accent glow. Capped at `TYRE_GLOW_PEAK`, which is a contrast constraint and not a
       * taste one: this blob is wide enough that its core lands on the copy column, and at full
       * strength the composite behind the text admits no readable colour at all for the paler
       * compounds. Opacity does not animate on direction — a blurred field has no edge to read
       * a position from, so moving it only smears.
       */}
      {/*
       * Clipped, because a 520px blob centred on a 390px viewport hangs 65px off each edge and
       * a `blur-[120px]` extends it further still. Found in a browser: the whole page scrolled
       * sideways on a phone, which is the one thing the brief is explicit about avoiding. The
       * clip lives on a wrapper rather than on the explorer root so it cannot interfere with
       * the drag layer or with focus rings.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <motion.div
          className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[120px]"
          animate={{ backgroundColor: compound.color, opacity: TYRE_GLOW_PEAK }}
          transition={{ duration: reducedMotion ? 0 : 0.5 }}
          initial={false}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <CompoundTablist
          compounds={compounds}
          index={index}
          onSelect={select}
          tabId={tabId}
          panelId={panelId}
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 items-center gap-2">
          <span className="mr-1 text-xs tabular-nums text-zinc-400" aria-hidden="true">
            {index + 1} / {compounds.length}
          </span>
          <button
            type="button"
            onClick={previous}
            aria-label="Previous compound"
            className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next compound"
            className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/*
       * `overflow-hidden` so a scene that is mid-travel cannot widen the document — a
       * horizontal scrollbar appearing for 400ms on every change is the classic way this
       * pattern goes wrong on a phone.
       */}
      <div className="relative mt-8 overflow-hidden">
        {/*
         * The drag wrapper is always rendered and `drag` is switched off instead of the
         * element being switched out.
         *
         * The first version rendered the bare scene under reduced motion and the wrapper
         * otherwise, which is a **hydration mismatch**: `useReducedMotion()` is necessarily
         * `false` on the server, so a visitor with the OS setting on got one DOM tree from the
         * server and a structurally different one from the client. React logged
         * "Expected server HTML to contain a matching <span> in <div>" and threw away the
         * server markup for that subtree. Keeping the tree constant and changing only a prop
         * costs one always-mounted div and removes the whole class of problem.
         */}
        {/*
         * `dragListener={false}` is the load-bearing prop, and not for the reason it looks.
         *
         * framer-motion writes `user-select: none`, `-webkit-user-select: none` and
         * `-webkit-touch-callout: none` **inline and permanently** onto any element with `drag`
         * — gated precisely on `dragListener !== false`. With the listener on this wrapper, none
         * of the explainer's prose could be selected or copied, which is a poor trade on a page
         * whose whole purpose is to be read.
         *
         * So the gesture is started imperatively from the tyre instead (see
         * `onDragHandlePointerDown`), which is both the object a reader would instinctively
         * swipe and the only part of the scene nobody needs to select. Turning the listener off
         * also stops framer writing `touch-action`, so the tyre sets `touch-pan-y` itself.
         */}
        <motion.div
          drag="x"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={dragElasticFor(reducedMotion)}
          onDragEnd={onDragEnd}
        >
          {scene}
        </motion.div>
      </div>

      {/* `role="status"` already implies `aria-live="polite"`; the attribute is kept because
          `compound-explorer.test.tsx` asserts it explicitly and some older AT pairings only
          honour the explicit form. */}
      <p role="status" aria-live="polite" className="sr-only">
        {`${compound.name} — ${index + 1} of ${compounds.length}. ${compound.tagline}`}
      </p>
    </div>
  );
}
