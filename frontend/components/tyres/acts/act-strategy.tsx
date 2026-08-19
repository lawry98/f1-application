'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { STRATEGY_SCENARIOS } from '@/data/tyres-data';
import { focusRingOffsetBaseWarm } from '@/lib/focus';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

import { StrategyPanel, type PanelMotion, type StrategyTheme } from './strategy-panel';

/**
 * Per-scenario environment. Keyed by the ids already in `STRATEGY_SCENARIOS`, so adding a
 * scenario to the data without a theme here degrades to the neutral default rather than throwing.
 */
const THEME: Record<string, StrategyTheme> = {
  'hot-abrasive': { tint: '#e8382f', label: 'Track temperature high' },
  'safety-car-restart': { tint: '#ffd12e', label: 'Neutralised' },
  'long-first-stint': { tint: '#f4f4f5', label: 'Track position play' },
  'drying-track': { tint: '#3fbf4f', label: 'Drying' },
  'returning-rain': { tint: '#2b8fe0', label: 'Rain returning' },
  'close-call': { tint: '#a1a1aa', label: 'Marginal' },
};

const DEFAULT_THEME: StrategyTheme = { tint: '#a1a1aa', label: 'Scenario' };

/** Horizontal travel of the panel swap. Mobile uses less so nothing leaves the viewport. */
const OFFSET_DESKTOP = 24;
const OFFSET_MOBILE = 12;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Act 3b — strategy, scenario by scenario.
 *
 * Each scenario repaints the section as one deliberate unit: the ambient tint, the condition chip
 * and the whole content panel change together, keyed by `scenario.id` inside an `AnimatePresence`.
 * The scenario tabs stay put — only the panel beneath them transitions — so keyboard focus on a tab
 * never moves. `StrategyPanel` owns the choreography; this node owns selection, direction, the
 * synchronised glow and the panel's height.
 *
 * Only **one upside and one risk** are ever visible. That is a content decision the data already
 * supports — `advantage` and `risk` are separate fields — and it is what keeps six scenarios from
 * becoming six paragraphs. The reasoning behind them sits in the disclosure, which resets to closed
 * on every switch because the keyed panel remounts.
 *
 * The copy never says a scenario has one right answer; the field is called `leaning` and it is
 * rendered as a leaning.
 */
export function ActStrategy() {
  // Index and travel direction live in one object so direction is always derived from the true
  // previous index — the property that makes rapid clicks and large jumps resolve correctly.
  const [{ index, direction }, setSelection] = useState({ index: 0, direction: 0 });
  const reduced = useReducedMotionSafe();
  const [offset, setOffset] = useState(OFFSET_DESKTOP);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setOffset(mq.matches ? OFFSET_MOBILE : OFFSET_DESKTOP);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const scenario = STRATEGY_SCENARIOS[index] ?? STRATEGY_SCENARIOS[0];

  // Smooth the panel height between scenarios of different length. The inner wrapper reports its
  // natural (in-flow) height — the exiting panel is popped out of flow, so it never counts — and
  // the outer wrapper animates to it. Under reduced motion the height is left uncontrolled so the
  // native reflow just snaps, with no sustained movement.
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (reduced) {
      setHeight(null);
      return;
    }
    const el = innerRef.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [reduced]);

  if (!scenario) return null;
  const theme = THEME[scenario.id] ?? DEFAULT_THEME;
  const motionCustom: PanelMotion = { direction, offset: reduced ? 0 : offset };

  const select = (next: number) =>
    setSelection((prev) =>
      prev.index === next ? prev : { index: next, direction: Math.sign(next - prev.index) },
    );

  return (
    <section
      aria-labelledby="strategy-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base-warm"
    >
      {/* Ambient glow. It shares the scenario state with the panel, so the tint starts changing the
          moment the old panel begins to leave and is established as the new one settles — the two
          never fall out of step. Kept weak enough to stay under readable text. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full blur-[140px]"
        animate={{ backgroundColor: theme.tint, opacity: 0.16 }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
              onClick={() => select(i)}
              aria-pressed={i === index}
              className={cn(
                'min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
                focusRingOffsetBaseWarm,
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

        <motion.div
          className="mt-9 max-w-[62rem]"
          animate={reduced || height == null ? undefined : { height }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Inner wrapper is the positioning context for the popped-out exiting panel and the
              element whose natural height is measured. */}
          <div ref={innerRef} className="relative">
            <AnimatePresence mode="popLayout" initial={false} custom={motionCustom}>
              <StrategyPanel
                key={scenario.id}
                scenario={scenario}
                theme={theme}
                motionCustom={motionCustom}
                reduced={reduced}
              />
            </AnimatePresence>
          </div>
        </motion.div>

        {/* A concise, polite announcement of the change — not the whole panel in a live region,
            which would re-read every paragraph on each switch. */}
        <p role="status" aria-live="polite" className="sr-only">
          {`Selected strategy scenario: ${scenario.situation}.`}
        </p>
      </div>
    </section>
  );
}
