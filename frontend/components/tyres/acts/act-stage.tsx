'use client';

import { RACE_COMPOUNDS, TYRES_CONTENT_AS_OF, TYRES_SEASON } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

import { StatMeter } from '../lab/stat-meter';
import { TyreSwap } from '../lab/tyre-swap';
import { CompoundRail } from './compound-rail';
import type { CompoundSelection } from './use-compound-selection';

/**
 * Act 1 — the stage.
 *
 * The opening viewport: the selector, the render at size, and the three numbers that matter, with
 * nothing between them and the reader. Everything explanatory is downstream.
 *
 * Two colour rules are doing work here rather than taste. `f1-red` measures 4.01:1 on `base`,
 * under the 4.5:1 bar, so it only carries text above ~24px — the second headline line keeps it,
 * the 11px eyebrow takes the lifted `EYEBROW_RED`, and every other small label is a zinc. And the
 * compound hex stays true everywhere it appears, because in this act it only ever fills a glow, a
 * swatch or a meter segment; it never carries a glyph.
 */
export function ActStage({ index, compound, direction, select }: CompoundSelection) {

  return (
    <section
      aria-labelledby="stage-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base"
    >
      {/* Hairline red grid. A third of the weight it would carry on a light ground, where the
          same opacity reads as a visible mesh rather than as a tint. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #E10600 1px, transparent 1px), linear-gradient(to bottom, #E10600 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      {/* Compound light. Inside the isolate/overflow wrapper so a 28rem blob on a 390px viewport
          cannot scroll the page sideways. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[4%] top-1/2 h-[26rem] w-[26rem] -translate-y-1/2 rounded-full opacity-[0.22] blur-[130px] transition-colors duration-600"
        style={{ backgroundColor: compound.color }}
      />

      <div className="container relative mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14">
          <div className="min-w-0">
            <p
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: EYEBROW_RED }}
            >
              <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
              {TYRES_SEASON} season · Tyre lab
            </p>

            <h1
              id="stage-heading"
              className="mt-4 font-display text-[clamp(2.25rem,5.4vw,4.25rem)] font-black uppercase leading-[0.88] tracking-[-0.035em] text-ink"
            >
              Five compounds.
              <br />
              <span className="text-f1-red">Three per weekend.</span>
            </h1>

            <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-zinc-300">
              The numbered range is fixed for the season. Which three become Hard, Medium and Soft
              is chosen race by race.
            </p>

            <div className="mt-8">
              <h2 className="sr-only">Choose a compound</h2>
              <CompoundRail index={index} onSelect={select} />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[27rem] lg:max-w-none">
            <div aria-hidden="true" className="absolute inset-x-0 top-[42%] h-px bg-f1-red/25" />
            <TyreSwap
              compound={compound}
              direction={direction}
              sizes="(max-width: 1024px) 82vw, 40vw"
            />

            {/* The live region announces the swap for anyone who cannot see it happen. It carries
                the name and the position in the range, which is exactly what the directional
                transition communicates visually. */}
            <p role="status" aria-live="polite" className="sr-only">
              {`${compound.name} — ${index + 1} of ${RACE_COMPOUNDS.length}. ${compound.tagline}`}
            </p>

            <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-f1-red/25 pt-4">
              <StatMeter
                label="Grip"
                value={compound.grip}
                color={compound.color}
                group={compound.comparisonGroup}
              />
              <StatMeter
                label="Life"
                value={compound.durability}
                color={compound.color}
                group={compound.comparisonGroup}
              />
              <StatMeter
                label="Warm-up"
                value={compound.warmUp}
                color={compound.color}
                group={compound.comparisonGroup}
              />
            </dl>

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
              {`Content current as of ${TYRES_CONTENT_AS_OF}. Sources are listed at the foot of the page.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
