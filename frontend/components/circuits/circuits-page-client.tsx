'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CircuitCard } from '@/components/circuits/circuit-card';
import { SeasonSelect } from '@/components/standings/season-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSeasonCircuits } from '@/hooks/use-season-circuits';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { parseStandingsYear, standingsYears } from '@/lib/standings';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
/** The `/standings` link treatment: a flush ring, because a text link is not a filled control. */
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const SKELETON_CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

interface CircuitsPageClientProps {
  /** The newest season, read from the server's clock so render never reads one. */
  latestYear: number;
}

/**
 * `/circuits`: every round of one season as its circuit outline, with a season picker.
 *
 * **The season is URL state, handled exactly as `/standings` handles it**, for the reasons
 * `StandingsPageClient` documents: read from `useSearchParams()` and never copied into state, and
 * the picker's only write is `replaceState`. The range is `/standings`' range on purpose, so the
 * two pages' `?year=` links always name a season the other can show — hence the `standings`
 * helpers here.
 */
export function CircuitsPageClient({ latestYear }: CircuitsPageClientProps) {
  const year = parseStandingsYear(useSearchParams().getAll('year'), latestYear);
  const { circuits, loading, error, retry } = useSeasonCircuits(year);

  const selectYear = useCallback(
    (next: number) => {
      window.history.replaceState(
        null,
        '',
        next === latestYear ? '/circuits' : `/circuits?year=${next}`,
      );
    },
    [latestYear],
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-16">
      <header className="mb-12">
        <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
          <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
          {year} Season
        </p>
        <h1 className="mb-6 text-4xl font-black uppercase tracking-tight text-ink md:text-5xl">
          Circuits
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href={year === latestYear ? '/standings' : `/standings?year=${year}`} className={LINK}>
            {year} standings →
          </Link>
          <SeasonSelect years={standingsYears(latestYear)} value={year} onChange={selectYear} />
        </div>
      </header>

      {loading && (
        <div aria-busy="true">
          <p className="sr-only">Loading circuits…</p>
          <div aria-hidden="true" className={GRID}>
            {SKELETON_CARDS.map((key) => (
              <Skeleton key={key} className="aspect-[3/4] w-full bg-zinc-900 motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-sm text-zinc-300">Could not load the {year} calendar.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      )}
      {circuits && (
        <ul aria-label={`${year} calendar`} className={GRID}>
          {circuits.map((circuit) => (
            <li key={`${circuit.race.round}-${circuit.race.name}`}>
              <CircuitCard circuit={circuit} year={year} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
