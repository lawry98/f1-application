'use client';

import { useState } from 'react';
import { motion } from 'motion/react';

import { STRATEGY_SCENARIOS } from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

import { AnimatedDisclosure } from './animated-disclosure';
import { SourceList } from './source-list';

type Scenario = (typeof STRATEGY_SCENARIOS)[number];
type Theme = { tint: string; label: string };

/**
 * Per-scenario environment. Keyed by the ids already in `STRATEGY_SCENARIOS`, so adding a
 * scenario to the data without a theme here degrades to the neutral default rather than throwing.
 */
const THEME: Record<string, Theme> = {
  'hot-abrasive': { tint: '#e8382f', label: 'Track temperature high' },
  'safety-car-restart': { tint: '#ffd12e', label: 'Neutralised' },
  'long-first-stint': { tint: '#f4f4f5', label: 'Track position play' },
  'drying-track': { tint: '#3fbf4f', label: 'Drying' },
  'returning-rain': { tint: '#2b8fe0', label: 'Rain returning' },
  'close-call': { tint: '#a1a1aa', label: 'Marginal' },
};

const DEFAULT_THEME: Theme = { tint: '#a1a1aa', label: 'Scenario' };

/**
 * Act 3b — strategy, scenario by scenario.
 *
 * Each scenario repaints the section: the tint behind the panel, the condition chip and the
 * accent on the two outcome rows all come from the scenario, so changing it changes the
 * environment rather than just the paragraph.
 *
 * Only **one upside and one risk** are ever visible. That is a content decision the data already
 * supports — `advantage` and `risk` are separate fields — and it is what keeps six scenarios from
 * becoming six paragraphs. The reasoning behind them sits in the disclosure.
 *
 * The copy never says a scenario has one right answer; the field is called `leaning` and it is
 * rendered as a leaning.
 *
 * **The section frame is stable; only the panel is keyed.** The eyebrow, heading, scenario tabs
 * and the background tint stay mounted across a scenario change — the tabs must not move under the
 * pointer, and the tint animates its colour rather than remounting. The scenario-specific content
 * is a `ScenarioPanel` keyed by `scenario.id`, so selecting another scenario remounts it: its
 * `AnimatedDisclosure` starts closed every time, and an explanation opened for one scenario can
 * never be left showing under another. (A future keyed-transition layer — Step 2 — wraps this same
 * keyed panel in `AnimatePresence`; the boundary here is drawn for exactly that.)
 */
export function ActStrategy() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotionSafe();
  const scenario = STRATEGY_SCENARIOS[index] ?? STRATEGY_SCENARIOS[0];
  if (!scenario) return null;
  const theme = THEME[scenario.id] ?? DEFAULT_THEME;

  return (
    <section
      aria-labelledby="strategy-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base-warm"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full blur-[140px]"
        animate={{ backgroundColor: theme.tint, opacity: 0.16 }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Act 3b
        </p>
        <h2
          id="strategy-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          Strategy, situation by situation
        </h2>

        <div className="mt-8 flex flex-wrap gap-2">
          {STRATEGY_SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              className={cn(
                'rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
                focusRingOffsetBase,
                i === index
                  ? 'border-f1-red bg-white/[0.06] text-ink'
                  : 'border-white/15 text-zinc-400 hover:border-white/35 hover:text-zinc-200',
              )}
            >
              {s.situation}
              {i === index && <span className="sr-only">(selected)</span>}
            </button>
          ))}
        </div>

        <ScenarioPanel key={scenario.id} scenario={scenario} theme={theme} />
      </div>
    </section>
  );
}

/**
 * The scenario-specific content. Keyed by `scenario.id` at the call site, so it remounts on every
 * scenario change — which is what resets `AnimatedDisclosure` to closed and drops the outgoing
 * scenario's explanation and its source links out of the tree entirely (no stale content, no
 * lingering tab stops). The disclosure lives inside this keyed boundary on purpose.
 */
function ScenarioPanel({ scenario, theme }: { scenario: Scenario; theme: Theme }) {
  return (
    <div className="mt-9 max-w-[62rem]">
      {/* The condition chip names the environment in words, so the scenario is never
          identified by its tint alone. */}
      <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: theme.tint }}
        />
        {theme.label}
      </p>

      <h3 className="mt-4 font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
        {scenario.situation}
      </h3>
      <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-zinc-300">{scenario.detail}</p>

      <dl className="mt-7 grid gap-4 sm:grid-cols-2">
        <Outcome kind="Recommendation" value={scenario.advantage} tint={theme.tint} />
        <Outcome kind="Principal risk" value={scenario.risk} tint="#e8382f" />
      </dl>

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
    </div>
  );
}

function Outcome({ kind, value, tint }: { kind: string; value: string; tint: string }) {
  return (
    <div className="min-w-0 border-l-2 pl-4" style={{ borderColor: tint }}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">{kind}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-zinc-200">{value}</dd>
    </div>
  );
}
