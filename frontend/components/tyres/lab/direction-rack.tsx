'use client';

import { useState } from 'react';
import { motion } from 'motion/react';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

import { compoundLetter } from './compound-letter';
import type { DirectionProps } from './direction-spotlight';
import { TyrePhoto } from './tyre-photo';

/**
 * Direction F — "The rack": all five compounds at once, as a garage tyre rack.
 *
 * The source page presents the range as a stack of rows you open one at a time, which answers
 * "what is C3" but never "how does C3 compare". This inverts that: every compound is on screen
 * permanently, the selected one grows and the rest stay legible, so the comparison is the layout
 * rather than something the reader has to reconstruct from memory.
 *
 * Red is structural again — a rail runs behind the tyres and each plate hangs off it — and the
 * grid is a real CSS grid whose column weights animate, so nothing is absolutely positioned and
 * the whole thing reflows to a vertical rack on a phone with no second implementation.
 */
export function DirectionRack({ compound }: DirectionProps) {
  const [activeId, setActiveId] = useState(compound.id);
  const reduced = useReducedMotionSafe();
  const active = RACE_COMPOUNDS.find((c) => c.id === activeId) ?? compound;

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      {/* The rail the rack hangs from. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[42%] hidden h-px bg-f1-red/40 sm:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[110px] transition-colors duration-600"
        style={{ backgroundColor: active.color }}
      />

      <div className="relative px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-f1-red">
            <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
            The 2026 range
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            5 compounds · 3 nominated per race
          </p>
        </div>

        {/* The rack. `grid-template-columns` carries the emphasis, so the active plate genuinely
            takes space from its neighbours instead of overlapping them. */}
        <ul
          role="list"
          className="mt-7 grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: RACE_COMPOUNDS.map((c) =>
              c.id === activeId ? '1.9fr' : '1fr',
            ).join(' '),
            transition: reduced ? undefined : 'grid-template-columns 600ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {RACE_COMPOUNDS.map((c) => {
            const isActive = c.id === activeId;
            return (
              <li key={c.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'group flex h-full w-full flex-col items-center rounded-lg border px-2 pb-3 pt-2 transition-colors sm:px-3',
                    focusRingOffsetBase,
                    isActive
                      ? 'border-f1-red bg-white/[0.04]'
                      : 'border-white/10 hover:border-white/30',
                  )}
                >
                  {/* The letter is the non-colour channel for identity, and it is also the thing
                      that stays readable when a plate is squeezed to its narrowest. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'font-display font-black leading-none tracking-[-0.06em] transition-colors',
                      isActive ? 'text-[2.5rem] sm:text-[3.25rem]' : 'text-[1.75rem] sm:text-[2.25rem]',
                    )}
                    style={{ color: isActive ? c.color : '#71717a' }}
                  >
                    {compoundLetter(c)}
                  </span>

                  <motion.div
                    className="mt-1 w-full"
                    animate={{ opacity: isActive ? 1 : 0.55, scale: isActive ? 1 : 0.9 }}
                    transition={
                      reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
                    }
                  >
                    <TyrePhoto
                      compound={c}
                      sizes="(max-width: 640px) 30vw, 18vw"
                      className={cn(
                        'transition-[filter] duration-600',
                        isActive ? '' : 'grayscale-[0.55]',
                      )}
                    />
                  </motion.div>

                  <span
                    className={cn(
                      'mt-2 block text-center text-[10px] font-bold uppercase tracking-[0.16em] transition-colors',
                      isActive ? 'text-ink' : 'text-zinc-400 group-hover:text-zinc-200',
                    )}
                  >
                    {c.name}
                  </span>
                  {isActive && <span className="sr-only">(selected)</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {/* One read-out for the selected plate, on a red rule. Only the active compound gets
            prose, which is what keeps five tyres on screen from costing five paragraphs. */}
        <div className="mt-7 border-t border-f1-red/30 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h3 className="font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
              {active.name}
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              {active.category}
            </p>
          </div>
          <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-zinc-300">{active.tagline}</p>

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {(
              [
                ['Grip', active.grip],
                ['Life', active.durability],
                ['Warm-up', active.warmUp],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">{label}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="font-display text-xl font-black leading-none text-ink">
                    {value}
                  </span>
                  <span aria-hidden="true" className="flex gap-[3px]">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="h-3 w-[3px]"
                        style={{ backgroundColor: n <= value ? active.color : '#3f3f46' }}
                      />
                    ))}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
