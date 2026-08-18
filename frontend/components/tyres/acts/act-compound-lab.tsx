'use client';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { EYEBROW_RED, compoundTextOnCard } from '@/lib/tyre-utils';
import { cn } from '@/lib/utils';

import { compoundLetter } from '../lab/compound-letter';
import { SourceList } from './source-list';
import type { CompoundSelection } from './use-compound-selection';

/**
 * Act 2 — the compound lab.
 *
 * One compound at a time, at depth, with the whole range kept on screen as a scale so the number
 * you are reading always has something to be a number *against*. The attack scale is the spine:
 * every compound is a tick on it, the selected one is labelled, and it is the only place the five
 * are directly comparable at a glance.
 *
 * This is where the page's text budget is spent. The visible layer is the tagline, three
 * properties and one best-use line; everything longer — degradation behaviour, what it is suited
 * to, its strategic role, the worked scenario and the sources — sits behind a single disclosure,
 * because it is genuinely secondary rather than because it is filler.
 */
export function ActCompoundLab({ compound }: CompoundSelection) {
  return (
    <section
      aria-labelledby="lab-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base-warm"
    >
      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Act 2
        </p>
        <h2
          id="lab-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          The compound explorer
        </h2>

        {/* The attack scale. A single axis carrying all five, which is the comparison the five
            separate cards this replaced could never make. */}
        <div className="mt-10">
          <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            <span>Make it to the end</span>
            <span>One lap, everything</span>
          </div>
          <div className="relative mt-3 h-14">
            <div aria-hidden="true" className="absolute inset-x-0 top-2 h-px bg-white/15" />
            {RACE_COMPOUNDS.map((c) => {
              const active = c.id === compound.id;
              return (
                <div
                  key={c.id}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${c.attack * 100}%` }}
                >
                  <span
                    aria-hidden="true"
                    className={cn('block w-[3px] rounded-full transition-all duration-600', active ? 'h-5' : 'h-3')}
                    style={{ backgroundColor: active ? c.color : '#71717a' }}
                  />
                  <span
                    className={cn(
                      'mt-1.5 block font-display text-sm font-black leading-none transition-colors duration-600',
                      // zinc-400, not zinc-500: at 14px this is small text (4.5:1),
                      // and zinc-500 measures 4.11:1. The letter is the compound's
                      // non-colour identity channel, so it has to stay readable when
                      // it is not the selected one.
                      active ? '' : 'text-zinc-400',
                    )}
                    style={active ? { color: compoundTextOnCard(c.color) } : undefined}
                    aria-hidden="true"
                  >
                    {compoundLetter(c)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="sr-only">
            {`On the durability-to-attack scale, ${compound.name} sits at ${Math.round(
              compound.attack * 100,
            )} per cent towards maximum attack.`}
          </p>
        </div>

        {/* The selected compound, read out. */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              {compound.category}
            </p>
            <h3 className="mt-2 flex items-baseline gap-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-black uppercase leading-none tracking-[-0.04em] text-ink">
              <span
                aria-hidden="true"
                className="leading-none"
                style={{ color: compound.color }}
              >
                {compoundLetter(compound)}
              </span>
              {compound.name}
            </h3>
            <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-zinc-300">
              {compound.summary}
            </p>
            {compound.nominationNote && (
              <p className="mt-4 max-w-[48ch] border-l-2 border-f1-red/60 pl-4 text-sm leading-relaxed text-zinc-400">
                {compound.nominationNote}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Fact label="Best suited to" value={compound.suitedTo} />
              <Fact label="Strategic role" value={compound.strategicRole} />
            </dl>

            {/* Progressive disclosure. Native <details>, so it works with no JavaScript, is
                keyboard-operable for free, and is findable by in-page search when open. */}
            <details className="group mt-7 border-t border-white/10 pt-4">
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-4 rounded text-sm font-semibold text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-base-warm',
                  '[&::-webkit-details-marker]:hidden',
                )}
              >
                Technical notes
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-f1-red/50 text-f1-red transition-transform duration-300 ease-out-expo group-open:rotate-45"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>

              <div className="mt-4 space-y-5">
                <Note label="Warm-up" value={compound.warmUpNote} />
                <Note label="Degradation" value={compound.degradation} />
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    {compound.scenario.title}
                  </h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                    {compound.scenario.body}
                  </p>
                </div>
                <SourceList
                  sources={[compound.scenario.source, ...compound.sources]}
                  label={`Sources for ${compound.name}`}
                />
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-zinc-300">{value}</dd>
    </div>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
        {label}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{value}</p>
    </div>
  );
}
