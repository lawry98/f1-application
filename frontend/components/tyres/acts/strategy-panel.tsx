'use client';

import { forwardRef } from 'react';
import { motion, type Variants } from 'motion/react';

import type { StrategyScenario } from '@/data/tyres-data';

import { AnimatedDisclosure } from './animated-disclosure';
import { SourceList } from './source-list';

/** The per-scenario environment: the tint that repaints the section, and the condition in words. */
export interface StrategyTheme {
  tint: string;
  label: string;
}

/**
 * Direction and displacement, threaded through `AnimatePresence custom` and re-read by the
 * **exiting** panel at exit time — without it on the parent the old panel always leaves the way the
 * first one did, and the swap stops reading as directional after the first click.
 */
export interface PanelMotion {
  /** +1 for a scenario later in the list, -1 for an earlier one, 0 on first paint. */
  direction: number;
  /** Horizontal travel in px. Smaller on narrow viewports; 0 under reduced motion. */
  offset: number;
}

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** How far the panel drifts vertically as it settles. Small on purpose — text stays readable. */
const RISE = 6;

/**
 * The whole panel, as one arriving card.
 *
 * A later scenario enters from the right and the old one leaves left (reversed when going back), so
 * the horizontal travel says *where in the list you went*. The incoming panel arrives slowly — a
 * settle — while the outgoing one leaves fast, a clean cut, so the two never compete for the eye.
 * Opacity, blur and a barely-there scale are the panel's own; the four content groups only add a
 * small staggered vertical settle on top, which is what keeps it reading as one panel rather than
 * four independent animations.
 */
export const PANEL_VARIANTS: Variants = {
  enter: ({ direction, offset }: PanelMotion) => ({
    opacity: 0,
    x: offset * direction,
    y: RISE,
    scale: 0.985,
    filter: 'blur(5px)',
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.46,
      ease: EASE_OUT_EXPO,
      // The groups settle *during* the panel's arrival, not after it — a small stagger that starts
      // just behind the fade, so the whole thing reads as one card landing. No `when:
      // 'beforeChildren'`: that would hold the rows until the 0.46s fade finished and split the
      // motion into two sequential beats.
      delayChildren: 0.05,
      staggerChildren: 0.045,
    },
  },
  exit: ({ direction, offset }: PanelMotion) => ({
    opacity: 0,
    x: -offset * direction,
    y: -RISE,
    scale: 0.985,
    filter: 'blur(5px)',
    transition: { duration: 0.19, ease: 'easeIn' },
  }),
};

/**
 * Reduced motion keeps the *fact* of a transition — a short cross-fade — and drops every
 * displacement, blur, scale and stagger. An instant cut is more disorienting than a fade, and a
 * fade implies no self-motion, so it is not what the preference is asking to be spared.
 */
export const PANEL_VARIANTS_REDUCED: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.14, ease: 'linear' } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: 'linear' } },
};

/**
 * The four internal groups, in reveal order: condition chip, then heading and detail, then the two
 * outcome rows *together* (recommendation and risk stay paired), then the disclosure. Only a small
 * vertical settle — the panel's own fade carries the opacity, so nothing double-fades.
 */
const GROUP_VARIANTS: Variants = {
  enter: { y: 10 },
  center: { y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
  exit: { y: 0 },
};

const GROUP_VARIANTS_REDUCED: Variants = {
  enter: {},
  center: {},
  exit: {},
};

export interface StrategyPanelProps {
  scenario: StrategyScenario;
  theme: StrategyTheme;
  /** Direction + displacement for this swap; also gates the accent sweep. */
  motionCustom: PanelMotion;
  reduced: boolean;
}

/**
 * The scenario-specific content, keyed by `scenario.id` in the parent so switching scenarios
 * remounts it — which is also what resets the `AnimatedDisclosure` to closed for free (no
 * `resetKey` needed, since the keyed remount does it).
 *
 * This is the element `AnimatePresence` animates: its root carries the panel variants, and the four
 * groups inside inherit the enter/center/exit labels to run the staggered settle. The accent line
 * opts out of that inheritance (it sets its own `animate`) so it sweeps once rather than joining the
 * stagger.
 *
 * A `forwardRef` because `AnimatePresence mode="popLayout"` measures the child through a ref to pop
 * it out of flow on exit; a plain function component would drop that ref and the pop would fail.
 */
export const StrategyPanel = forwardRef<HTMLDivElement, StrategyPanelProps>(function StrategyPanel(
  { scenario, theme, motionCustom, reduced },
  ref,
) {
  const group = reduced ? GROUP_VARIANTS_REDUCED : GROUP_VARIANTS;
  // Only sweep the accent on a real, user-driven swap — never on the first paint of the section.
  const sweep = !reduced && motionCustom.direction !== 0;

  return (
    <motion.div
      ref={ref}
      className="relative"
      custom={motionCustom}
      variants={reduced ? PANEL_VARIANTS_REDUCED : PANEL_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {/* Accent: a thin scenario-coloured line that sweeps across the top edge once as the panel
          arrives, then holds static. Reinforces the pit-wall character without looping. */}
      <motion.span
        aria-hidden="true"
        className="absolute -top-px left-0 h-[2px] w-full origin-left rounded-full"
        style={{ backgroundColor: theme.tint }}
        initial={sweep ? { scaleX: 0, opacity: 0.85 } : false}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={sweep ? { duration: 0.55, ease: EASE_OUT_EXPO, delay: 0.06 } : { duration: 0 }}
      />

      {/* The condition chip names the environment in words, so the scenario is never identified by
          its tint alone. */}
      <motion.p
        variants={group}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: theme.tint }}
        />
        {theme.label}
      </motion.p>

      <motion.div variants={group}>
        <h3 className="mt-4 font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
          {scenario.situation}
        </h3>
        <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-zinc-300">{scenario.detail}</p>
      </motion.div>

      <motion.dl variants={group} className="mt-7 grid gap-4 sm:grid-cols-2">
        <Outcome kind="Recommendation" value={scenario.advantage} tint={theme.tint} />
        <Outcome kind="Principal risk" value={scenario.risk} tint="#e8382f" />
      </motion.dl>

      <motion.div variants={group}>
        <AnimatedDisclosure
          summary="What teams lean towards, and why"
          surface="base-warm"
          className="mt-7 border-t border-white/10 pt-4"
        >
          <div className="mt-4 space-y-5">
            <p className="max-w-[62ch] text-sm leading-relaxed text-zinc-300">{scenario.leaning}</p>
            <SourceList sources={scenario.sources} label={`Sources for ${scenario.situation}`} />
          </div>
        </AnimatedDisclosure>
      </motion.div>
    </motion.div>
  );
});

function Outcome({ kind, value, tint }: { kind: string; value: string; tint: string }) {
  return (
    <div className="min-w-0 border-l-2 pl-4" style={{ borderColor: tint }}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">{kind}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-zinc-200">{value}</dd>
    </div>
  );
}
