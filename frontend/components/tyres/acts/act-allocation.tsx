'use client';

import { useState } from 'react';
import { motion } from 'motion/react';

import {
  ALLOCATION_EXAMPLES,
  ALLOCATION_RULES,
  ALLOCATION_TRACKED_COMPOUND,
  COMPOUND_COLORS,
  DRY_RANGE,
  DRY_RANGE_SOURCE,
} from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

import { AnimatedDisclosure } from './animated-disclosure';
import { SourceList } from './source-list';

const LABEL_COLOR = {
  Hard: COMPOUND_COLORS.hard,
  Medium: COMPOUND_COLORS.medium,
  Soft: COMPOUND_COLORS.soft,
} as const;

/**
 * Act 3 — how three of five become Hard, Medium and Soft.
 *
 * A selection lens slides along the C1–C5 rail as you change race, and the three labels are drawn
 * *underneath the numbers it lands on*. That movement is the argument: the same C3 is the Soft at
 * Suzuka, the Medium at Barcelona and the Hard at Monaco, and watching one number change its label
 * three times says that faster than any sentence.
 *
 * **The numbered range is rendered in graphite, never in compound colour.** Only a label owns a
 * colour; a coloured `C3` chip would assert exactly the fixed mapping this section exists to deny.
 * The colour appears only on the label row beneath the lens, where it is earned.
 */
export function ActAllocation() {
  const [raceIndex, setRaceIndex] = useState(0);
  const reduced = useReducedMotionSafe();
  const race = ALLOCATION_EXAMPLES[raceIndex] ?? ALLOCATION_EXAMPLES[0];
  if (!race) return null;

  const picked = race.picks.map((p) => p.compound);
  const firstIdx = DRY_RANGE.findIndex((d) => d.name === picked[0]);
  const span = picked.length;
  const step = 100 / DRY_RANGE.length;

  return (
    <section
      aria-labelledby="allocation-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base"
    >
      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Act 3
        </p>
        <h2
          id="allocation-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          How Hard, Medium and Soft are decided
        </h2>
        <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-zinc-300">
          Pirelli nominates three of the five for each Grand Prix. The labels are positions in that
          nomination, not products.
        </p>

        {/* Race picker */}
        <div className="mt-8 flex flex-wrap gap-2">
          {ALLOCATION_EXAMPLES.map((r, i) => (
            <button
              key={r.event}
              type="button"
              onClick={() => setRaceIndex(i)}
              aria-pressed={i === raceIndex}
              className={cn(
                'rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
                focusRingOffsetBase,
                i === raceIndex
                  ? 'border-f1-red bg-white/[0.05] text-ink'
                  : 'border-white/15 text-zinc-400 hover:border-white/35 hover:text-zinc-200',
              )}
            >
              {r.event}
              {i === raceIndex && <span className="sr-only">(selected)</span>}
            </button>
          ))}
        </div>

        {/* The rail. A grid of five equal columns, so the lens can be positioned in percentages
            that are guaranteed to line up with the numbers rather than approximately near them. */}
        <div className="mt-10 overflow-hidden">
          <div className="relative">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${DRY_RANGE.length}, minmax(0, 1fr))` }}
            >
              {DRY_RANGE.map((d) => (
                <div key={d.id} className="min-w-0 text-center">
                  <p className="font-display text-[clamp(1.5rem,4vw,2.5rem)] font-black leading-none tracking-[-0.04em] text-zinc-300">
                    {d.name}
                  </p>
                  <p className="mt-1 hidden text-[10px] leading-tight text-zinc-400 sm:block">
                    {d.character}
                  </p>
                </div>
              ))}
            </div>

            {/* The lens */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-y-2 rounded-xl border-2 border-f1-red bg-f1-red/[0.07]"
              initial={false}
              animate={{ left: `${firstIdx * step}%`, width: `${span * step}%` }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
              }
            />
          </div>

          {/* The labels, drawn under whichever numbers the lens landed on. */}
          <div
            className="mt-6 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${DRY_RANGE.length}, minmax(0, 1fr))` }}
          >
            {DRY_RANGE.map((d) => {
              const pick = race.picks.find((p) => p.compound === d.name);
              return (
                <div key={d.id} className="min-w-0 text-center">
                  {pick ? (
                    <motion.div
                      key={`${race.event}-${pick.label}`}
                      initial={reduced ? false : { opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reduced ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="mx-auto block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: LABEL_COLOR[pick.label] }}
                      />
                      <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
                        {pick.label}
                      </span>
                    </motion.div>
                  ) : (
                    <span className="block text-[11px] text-zinc-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* The plain-text version of everything the lens just did, for anyone not watching it. */}
        <p role="status" aria-live="polite" className="mt-6 max-w-[60ch] text-sm leading-relaxed text-zinc-300">
          {`At ${race.event}, ${race.picks
            .map((p) => `${p.compound} is the ${p.label}`)
            .join(', ')}.`}
        </p>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-zinc-400">{race.note}</p>

        <AnimatedDisclosure
          summary={`How the ${ALLOCATION_TRACKED_COMPOUND} moves, and the rules behind it`}
          surface="base"
          className="mt-8 border-t border-white/10 pt-4"
        >
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                {`${ALLOCATION_TRACKED_COMPOUND} across these three races`}
              </h3>
              <ul className="mt-2.5 space-y-1.5" role="list">
                {ALLOCATION_EXAMPLES.map((r) => {
                  const p = r.picks.find((x) => x.compound === ALLOCATION_TRACKED_COMPOUND);
                  if (!p) return null;
                  return (
                    <li key={r.event} className="text-sm text-zinc-300">
                      <span className="text-zinc-400">{r.event}: </span>
                      <span className="font-semibold text-ink">{`${ALLOCATION_TRACKED_COMPOUND} is the ${p.label}`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {ALLOCATION_RULES.map((rule) => (
                <div key={rule.label} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    {rule.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-zinc-300">{rule.value}</dd>
                </div>
              ))}
            </dl>

            <SourceList
              sources={[
                DRY_RANGE_SOURCE,
                ...ALLOCATION_EXAMPLES.map((r) => r.source),
                ...ALLOCATION_RULES.map((r) => r.source),
              ]}
              label="Sources for allocation"
            />
          </div>
        </AnimatedDisclosure>
      </div>
    </section>
  );
}
