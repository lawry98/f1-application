'use client';

import { useCallback, useRef, useState } from 'react';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { cn } from '@/lib/utils';

import { compoundLetter } from './compound-letter';
import { StatMeter } from './stat-meter';
import { TyreSwap, type SwapVariant } from './tyre-swap';

export interface DirectionPZeroDarkProps {
  swap: SwapVariant;
}

/**
 * Direction D, on the app's own dark ground.
 *
 * Keeps everything the light version was chosen for — red as *structural ink*, the oversized
 * compound letter, and the outlined pill-row with a split arrow cell — and drops the white
 * background, so `/tyres` stays part of the app rather than becoming an island.
 *
 * Two things had to change with the ground, not just the fill:
 *
 * **`f1-red` is 4.01:1 on `base`, which is below the 4.5:1 bar for small text.** On white it was
 * legal everywhere; here it is legal only above ~24px. So the giant letter and the arrow keep it,
 * the eyebrow uses `EYEBROW_RED` (the lifted red `lib/tyre-utils.ts` already exports for exactly
 * this), and the row's compound name — 14px — is `text-ink` rather than red.
 *
 * **The hairline grid inverts.** A red grid that read as a faint tint on white becomes a visible
 * mesh on near-black at the same opacity, so it drops to a third of its weight.
 */
export function DirectionPZeroDark({ swap }: DirectionPZeroDarkProps) {
  const [index, setIndex] = useState(2);
  const [openId, setOpenId] = useState<string | null>(RACE_COMPOUNDS[2]?.id ?? null);
  const direction = useRef(1);

  const select = useCallback((next: number) => {
    setIndex((prev) => {
      // Travel direction drives the directional swaps. Computed here rather than inside the
      // transition because by the time the variant runs, `prev` is gone.
      if (next !== prev) direction.current = next > prev ? 1 : -1;
      return next;
    });
  }, []);

  const shown = RACE_COMPOUNDS[index] ?? RACE_COMPOUNDS[0];
  if (!shown) return null;

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      {/* The grid, at a third of the light version's weight — see the note above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #E10600 1px, transparent 1px), linear-gradient(to bottom, #E10600 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      {/* Compound light behind the render. Decorative, so it keeps the true hex. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full opacity-[0.22] blur-[130px] transition-colors duration-600"
        style={{ backgroundColor: shown.color }}
      />

      <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: EYEBROW_RED }}
          >
            <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
            2026 P Zero range
          </p>

          <h3 className="mt-4 font-display text-[clamp(2.25rem,5.2vw,4rem)] font-black uppercase leading-[0.88] tracking-[-0.035em] text-ink">
            Five compounds.
            <br />
            {/* Red is legal here because it is ~64px — well over the 24px floor. */}
            <span className="text-f1-red">Three per weekend.</span>
          </h3>

          <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-zinc-300">
            The numbered range is fixed for the season. Which three become Hard, Medium and Soft is
            chosen race by race.
          </p>

          <ul className="mt-7 space-y-2.5" role="list">
            {RACE_COMPOUNDS.map((c, i) => {
              const selected = i === index;
              const open = openId === c.id;
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      'overflow-hidden rounded-xl border transition-colors duration-300',
                      selected
                        ? 'border-f1-red bg-white/[0.05]'
                        : 'border-f1-red/30 hover:border-f1-red/70',
                    )}
                  >
                    <div className="flex items-stretch">
                      {/* Selecting the compound and disclosing its detail are two different
                          intents, so they are two different controls sharing one row — which is
                          also why this is not a <details>: its summary can only do one of them. */}
                      <button
                        type="button"
                        onClick={() => select(i)}
                        aria-pressed={selected}
                        className={cn(
                          'flex flex-1 items-center gap-4 px-4 py-3 text-left sm:gap-5 sm:px-5',
                          focusRingOffsetBase,
                        )}
                      >
                        <span
                          className="font-display text-[2.1rem] font-black leading-none tracking-[-0.06em] transition-colors duration-600 sm:text-[2.6rem]"
                          // Large text (≥33px) clears the 3:1 bar for every compound colour on
                          // `base`; below that this would need a lift.
                          style={{ color: selected ? c.color : '#52525b' }}
                          aria-hidden="true"
                        >
                          {compoundLetter(c)}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              // `sm:text-[1rem]`, never `sm:text-base`: this theme defines a
                              // *colour* token called `base`, so `text-base` is ambiguous, and at
                              // a responsive variant the colour wins — painting this name
                              // `#09090b` on the `#09090b` page. See the note in CLAUDE.md.
                              'block text-sm font-bold transition-colors sm:text-[1rem]',
                              selected ? 'text-ink' : 'text-zinc-300',
                            )}
                          >
                            {c.name}
                          </span>
                          <span className="block truncate text-xs text-zinc-400">{c.tagline}</span>
                        </span>
                        {selected && <span className="sr-only">(selected)</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : c.id)}
                        aria-expanded={open}
                        aria-label={`${open ? 'Hide' : 'Show'} details for ${c.name}`}
                        className={cn(
                          'flex w-14 shrink-0 items-center justify-center border-l text-f1-red transition-colors sm:w-16',
                          selected ? 'border-f1-red' : 'border-f1-red/30',
                          focusRingOffsetBase,
                        )}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={cn(
                            'h-5 w-5 transition-transform duration-300 ease-out-expo',
                            open && 'rotate-180',
                          )}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M12 4v16M5 13l7 7 7-7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-f1-red/20 px-4 py-3.5 sm:px-5">
                        <p className="max-w-[58ch] text-sm leading-relaxed text-zinc-300">
                          {c.summary}
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The render, on a red rule, with the measured read-out beneath it. */}
        <div className="relative mx-auto w-full max-w-[27rem] lg:max-w-none">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-[42%] h-px bg-f1-red/25"
          />
          <TyreSwap
            compound={shown}
            direction={direction.current}
            variant={swap}
            sizes="(max-width: 1024px) 82vw, 40vw"
          />

          <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-f1-red/25 pt-3.5">
            <StatMeter label="Grip" value={shown.grip} color={shown.color} group={shown.comparisonGroup} />
            <StatMeter
              label="Life"
              value={shown.durability}
              color={shown.color}
              group={shown.comparisonGroup}
            />
            <StatMeter
              label="Warm-up"
              value={shown.warmUp}
              color={shown.color}
              group={shown.comparisonGroup}
            />
          </dl>
        </div>
      </div>
    </div>
  );
}
