'use client';

import { useState } from 'react';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { focusRing } from '@/lib/focus';
import { cn } from '@/lib/utils';

import { compoundLetter } from './compound-letter';
import type { DirectionProps } from './direction-spotlight';
import { TyrePhoto } from './tyre-photo';

/**
 * Direction D — "P Zero", the light inversion.
 *
 * The closest translation of Pirelli's own page: an off-white ground, red used as *structural
 * ink* rather than as an accent, an oversized red compound letter, and the outlined pill-row with
 * a split action cell that is the source page's single most recognisable device.
 *
 * The bet is that `/tyres` becomes a **light island** in a dark app. That is an editorial
 * statement rather than an accident — this page is about a physical product, and product pages in
 * this industry are white. It uses the app's own `ink` token as the ground, so it is a palette
 * inversion, not a second palette.
 */
export function DirectionPZero({ compound }: DirectionProps) {
  const [openId, setOpenId] = useState<string | null>(compound.id);
  const shown = RACE_COMPOUNDS.find((c) => c.id === openId) ?? compound;

  return (
    <div className="relative w-full overflow-hidden bg-ink">
      {/* A hairline red grid, barely there. Pirelli's pages sit on an implied grid, and this is
          what stops a white page reading as an empty one. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #E10600 1px, transparent 1px), linear-gradient(to bottom, #E10600 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-f1-red">
            <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
            2026 P Zero range
          </p>

          <h3 className="mt-4 font-display text-[clamp(2.25rem,5.2vw,4rem)] font-black uppercase leading-[0.88] tracking-[-0.035em] text-zinc-950">
            Five compounds.
            <br />
            <span className="text-f1-red">Three per weekend.</span>
          </h3>

          <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-zinc-700">
            The numbered range is fixed for the season. Which three become Hard, Medium and Soft is
            chosen race by race.
          </p>

          {/* The source page's row grammar: a thin red-outlined pill, a huge red letter, the name,
              and a split cell carrying the disclosure arrow. A native <details> cannot share its
              border with a sibling arrow cell, so this is a real button with aria-expanded. */}
          <ul className="mt-7 space-y-3" role="list">
            {RACE_COMPOUNDS.map((c) => {
              const open = openId === c.id;
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      'overflow-hidden rounded-xl border bg-white/40 transition-colors',
                      open ? 'border-f1-red bg-white' : 'border-f1-red/40 hover:border-f1-red',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : c.id)}
                      aria-expanded={open}
                      className={cn(
                        'flex w-full items-stretch text-left',
                        focusRing,
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                      )}
                    >
                      <span className="flex flex-1 items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
                        <span
                          className="font-display text-[2.25rem] font-black leading-none tracking-[-0.06em] text-f1-red sm:text-[2.75rem]"
                          aria-hidden="true"
                        >
                          {compoundLetter(c)}
                        </span>
                        <span className="min-w-0">
                          {/* `sm:text-[1rem]`, not `sm:text-base` — `base` is a colour token in
                              this theme, and at a responsive variant the colour beats the
                              earlier `text-f1-red`. */}
                          <span className="block text-sm font-bold text-f1-red sm:text-[1rem]">
                            {c.name}
                          </span>
                          <span className="block truncate text-xs text-zinc-600">{c.tagline}</span>
                        </span>
                        {/* Compound identity carried by a swatch as well as by the letter — the
                            letter is the non-colour channel, so this can stay decorative. */}
                        <span
                          aria-hidden="true"
                          className="ml-auto hidden h-6 w-6 shrink-0 rounded-full border-2 border-zinc-950/15 sm:block"
                          style={{ backgroundColor: c.color }}
                        />
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex w-14 shrink-0 items-center justify-center border-l text-f1-red transition-transform duration-300 ease-out-expo sm:w-20',
                          open ? 'rotate-180 border-f1-red' : 'border-f1-red/40',
                        )}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-6 w-6"
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
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-f1-red/25 px-4 py-4 sm:px-6">
                        <p className="max-w-[58ch] text-sm leading-relaxed text-zinc-700">
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

        {/* The product render, on the grid rather than floating: a red rule crosses behind it and
            the caption sits on that rule, so the photograph is placed rather than pasted. */}
        <div className="relative mx-auto w-full max-w-[27rem] lg:max-w-none">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-f1-red/30"
          />
          <div className="relative">
            <TyrePhoto compound={shown} priority />
          </div>
          <div className="relative mt-1 flex items-baseline justify-between border-t border-f1-red/30 pt-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
              {shown.name} · {shown.tread}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-f1-red">
              Grip {shown.grip}/5 · Life {shown.durability}/5
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
