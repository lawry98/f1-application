'use client';

import { useReducedMotion } from 'motion/react';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { CompoundExplorer } from './compound-explorer';

/**
 * The one client boundary on the page.
 *
 * `useReducedMotion()` is called **here and nowhere else**, matching the convention the teams
 * page established: one read at the top, threaded down as a plain `reducedMotion: boolean`.
 * That keeps every child a pure function of its props — which is also why the reduced-motion
 * tests can simply pass `true` instead of reaching into `matchMedia`.
 *
 * Everything above and below this section stays a server component.
 */
export function CompoundExplorerSection() {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <section
      id="explorer"
      className="scroll-mt-20 border-b border-zinc-800 bg-zinc-950 py-16 lg:py-20"
      aria-labelledby="explorer-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mb-10 max-w-3xl">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-widest"
            style={{ color: EYEBROW_RED }}
          >
            One at a time
          </p>
          <h2
            id="explorer-heading"
            className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
          >
            The compound explorer
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Five tyres a driver can actually be on. Move between them with the arrows, the compound
            strip, the arrow keys, or a swipe.
          </p>
        </div>

        <CompoundExplorer compounds={RACE_COMPOUNDS} reducedMotion={reducedMotion} />
      </div>
    </section>
  );
}
