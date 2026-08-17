'use client';

import { DirectionPZeroDark } from './direction-pzero-dark';
import { SWAP_LABELS, type SwapVariant } from './tyre-swap';

const ORDER: readonly SwapVariant[] = ['dissolve', 'rack', 'spin'];

/**
 * A throwaway comparison surface for choosing the compound-swap transition.
 *
 * Three copies of the *same* chosen direction, differing only in how the render changes — which
 * is the only honest way to judge a transition. Showing one instance with a variant picker would
 * mean comparing what is on screen against a memory of what was, and 600ms is well past the
 * window where that comparison is reliable.
 *
 * This route is deleted once a transition is picked; only `tyre-swap.tsx` survives.
 */
export function DirectionsPreview() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-9">
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
          <span className="h-1.5 w-5 bg-f1-red" aria-hidden="true" />
          Transition preview
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.75rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink">
          Pick a transition
        </h1>
        <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-zinc-300">
          Direction D, on the dark ground, with the grip / life / warm-up meters from E and F. The
          three panels below are identical except for how the tyre changes. Click through the
          compound rows in each — the difference only exists in motion.
        </p>
      </header>

      <div className="space-y-14">
        {ORDER.map((variant) => (
          <section key={variant} aria-labelledby={`swap-${variant}`}>
            <h2
              id={`swap-${variant}`}
              className="font-display text-xl font-black uppercase tracking-tight text-ink"
            >
              {SWAP_LABELS[variant].name}
            </h2>
            <p className="mb-4 mt-2 max-w-[72ch] text-sm leading-relaxed text-zinc-400">
              {SWAP_LABELS[variant].blurb}
            </p>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <DirectionPZeroDark swap={variant} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
