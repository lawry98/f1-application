'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CircuitGlow } from '@/components/candy/circuit-glow';
import { CircuitWinners } from '@/components/circuits/circuit-winners';
import { useCalendarRace } from '@/hooks/use-calendar-race';
import { useCircuitWinners } from '@/hooks/use-circuit-winners';
import type { CircuitEntry } from '@/lib/circuit-geometry';
import { focusRing } from '@/lib/focus';
import { parseRaceDate } from '@/lib/race-date';
import { parseStandingsYear } from '@/lib/standings';
import type { Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);

interface CircuitDetailClientProps {
  circuit: CircuitEntry;
  /** Loaded on the server, so this page downloads no outline chunk. */
  points: Point[];
  latestYear: number;
}

/**
 * `/circuits/[slug]`: one circuit's outline, facts, place on a season's calendar, and recent
 * winners.
 *
 * **The text column sits beside the glow, never over it**, for the measured reason
 * `briefing-circuit-band.tsx` gives: over the red line layer `zinc-400` falls to 2.24:1.
 *
 * `?year=` only chooses which season's calendar row to show and where the back link returns to.
 * It's read from `useSearchParams` like `/circuits`, and this page never writes it.
 */
export function CircuitDetailClient({ circuit, points, latestYear }: CircuitDetailClientProps) {
  const year = parseStandingsYear(useSearchParams().getAll('year'), latestYear);
  const race = useCalendarRace(circuit.id, year);
  const winners = useCircuitWinners(circuit.id);
  const date = race ? parseRaceDate(race.date) : null;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-16">
      <Link href={year === latestYear ? '/circuits' : `/circuits?year=${year}`} className={LINK}>
        ← {year} circuits
      </Link>

      <div className="mt-10 grid items-center gap-10 md:grid-cols-2">
        <div className="mx-auto aspect-square w-full max-w-md">
          <CircuitGlow points={points} variant="glow" draw="immediate" className="h-full w-full" />
        </div>
        <div>
          <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
            <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
            {circuit.location}
          </p>
          <h1 className="mb-8 text-3xl font-black uppercase tracking-tight text-ink md:text-4xl">
            {circuit.name}
          </h1>
          <dl className="grid grid-cols-2 gap-6">
            <div>
              <dt className={LABEL}>Length</dt>
              <dd className="mt-1 font-mono text-xl text-ink">{(circuit.lengthM / 1000).toFixed(1)} km</dd>
            </div>
            <div>
              <dt className={LABEL}>First Grand Prix</dt>
              <dd className="mt-1 font-mono text-xl text-ink">{circuit.firstGp}</dd>
            </div>
          </dl>
          {race && (
            <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              {[`Round ${race.round}`, date && `${date.day} ${date.monthAbbr} ${date.year}`, race.official_name]
                .filter(Boolean)
                .join(' · ')}
              {race.event_format.includes('sprint') && (
                <span className="ml-2 rounded-sm bg-zinc-800 px-1.5 py-0.5 font-sans font-semibold text-zinc-200">
                  Sprint
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <CircuitWinners {...winners} />
    </div>
  );
}
