import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { DotPattern } from '@/components/ui/dot-pattern';
import { COMPOUND_COLORS, TYRES_CONTENT_AS_OF, TYRES_SEASON } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

const WALL = [
  COMPOUND_COLORS.hard,
  COMPOUND_COLORS.medium,
  COMPOUND_COLORS.soft,
  COMPOUND_COLORS.intermediate,
  COMPOUND_COLORS.wet,
];

/**
 * Short on purpose.
 *
 * The brief asks for the trade-off to be stated without delaying access to the explorer, so
 * this is one sentence, one badge and a jump link — not a full-height landing hero. The
 * compound wall behind it is static: five bands, true hex, no animation, because the page's
 * one memorable movement should be the explorer's and not a curtain-raiser competing with it.
 */
export function TyresHero() {
  return (
    <section
      className="relative overflow-hidden border-b border-zinc-800/60 bg-zinc-950 pt-14"
      aria-labelledby="tyres-hero-heading"
    >
      <DotPattern className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_top,white_10%,transparent_70%)]" />

      {/* Five compound bands. Decorative, true hex, and gone below `sm` where five slivers
          would be noise rather than a signal.

          `top-14`, not `top-0`: the site nav is `fixed h-14` and paints over the top of this
          section, so a band at the section's own top edge is simply never visible. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-14 hidden h-1 sm:flex"
        aria-hidden="true"
      >
        {WALL.map((color) => (
          <span key={color} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>

      <div className="container relative mx-auto max-w-7xl px-4 py-16 lg:py-24">
        <p
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: EYEBROW_RED }}
        >
          {TYRES_SEASON} season
        </p>
        <h1
          id="tyres-hero-heading"
          className="mt-3 text-5xl font-black uppercase tracking-tight text-white lg:text-7xl"
        >
          Tyres
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Four things pull against each other on every lap: grip, durability, temperature and
          strategy. Buy more of one and you pay for it in another. Every compound below is a
          different answer to that trade — and the answer that wins changes with the circuit, the
          weather and the lap you are on.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="#explorer"
            className="inline-flex items-center gap-2 rounded-lg bg-f1-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Open the compound explorer
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="text-xs text-zinc-400">
            Content current as of {TYRES_CONTENT_AS_OF}. Sources are listed at the foot of the page.
          </p>
        </div>
      </div>
    </section>
  );
}
