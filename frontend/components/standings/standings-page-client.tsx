'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { SeasonSelect } from '@/components/standings/season-select';
import {
  ConstructorStandingsTable,
  DriverStandingsTable,
} from '@/components/standings/standings-tables';
import { Skeleton } from '@/components/ui/skeleton';
import { useStandings } from '@/hooks/use-standings';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import {
  STANDINGS_FIRST_YEAR,
  parseStandingsYear,
  seasonStamp,
  standingsYears,
} from '@/lib/standings';
import { cn } from '@/lib/utils';

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const SECTION_HEADING = 'text-2xl font-black uppercase tracking-tight text-ink';
/** The link treatment `/credits` uses. A flush ring, because a text link is not a filled control. */
const LINK = cn(
  'rounded text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);
/** A filled neutral button: its label is judged against `zinc-800`, the fill it sits on. */
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);

/** Stable keys for the placeholder rows — `react/no-array-index-key` forbids the index. */
const SKELETON_SECTIONS = ['drivers', 'constructors'] as const;
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

interface StandingsPageClientProps {
  /** The newest season, read from the server's clock so render never reads one. */
  latestYear: number;
}

/**
 * `/standings`: one season's drivers' and constructors' tables, stacked, with a picker.
 *
 * Both tables are always in the page — no tabs, no `AnimatePresence` swap — so either is
 * reachable without interaction and both stay testable. The four states are mutually exclusive:
 * loading, error, a season that has not started, and data.
 */
export function StandingsPageClient({ latestYear }: StandingsPageClientProps) {
  // The URL owns the season, and this component holds no copy of it. A year held in state seeded
  // from a server prop desynced both ways: Next keys the page segment without its search params,
  // so the component survives a same-page navigation — the nav's "Standings" link left the bare
  // URL showing the picked 2024 — and its patched `replaceState` moves the router's URL but not
  // the RSC payload, so Back re-mounted `?year=2024` from the original payload's 2026.
  // `useSearchParams()` follows the patched `replaceState`, Back, Forward and links alike.
  const year = parseStandingsYear(useSearchParams().getAll('year'), latestYear);
  const { standings, calendar, loading, error, retry } = useStandings(year);

  const selectYear = useCallback(
    (next: number) => {
      // The only write: `useSearchParams()` picks the new query up and re-renders with it.
      // Replace, not push: a picker is not navigation, so it should not fill the back stack.
      // Next 14.2 syncs native history calls into its router, so this costs no server round
      // trip. The newest season keeps the bare URL.
      window.history.replaceState(
        null,
        '',
        next === latestYear ? '/standings' : `/standings?year=${next}`,
      );
    },
    [latestYear],
  );

  const stamp = standings ? seasonStamp(standings.races_completed, calendar) : null;
  // Empty tables, not a zero race count: the route serves empty tables only when no scoring
  // session has results. A season whose only held session is a sprint has a real table with
  // `races_completed: 0`, and keying this off the count would hide it behind "hasn't started".
  // The stamp needs no special case — `seasonStamp` is already null at zero races.
  const notStarted = standings !== null && standings.drivers.length === 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <header className="mb-12">
        <p className={cn('mb-3 flex items-center gap-3', LABEL)}>
          {/* The repeated red tick — decorative, so it is not held to a text-contrast bar. */}
          <span aria-hidden="true" className="h-1.5 w-5 flex-shrink-0 bg-f1-red" />
          {year} Season
        </p>
        <h1 className="mb-6 text-4xl font-black uppercase tracking-tight text-ink md:text-5xl">
          Championship Standings
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Polite, so a season change is announced once its table has landed. `min-h-6` holds
              the row's height while the stamp is still empty. */}
          <p
            aria-live="polite"
            className="flex min-h-6 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400"
          >
            {stamp?.label}
            {stamp?.final && (
              <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-sans font-semibold text-zinc-200">
                Final
              </span>
            )}
          </p>
          <SeasonSelect years={standingsYears(latestYear)} value={year} onChange={selectYear} />
        </div>
      </header>

      {loading && <LoadingState />}
      {error && <ErrorState onRetry={retry} />}
      {notStarted && <NotStartedState year={year} onSelectYear={selectYear} />}
      {standings && !notStarted && (
        <>
          <section aria-labelledby="drivers-heading" className="mb-16">
            <h2 id="drivers-heading" className={cn('mb-6', SECTION_HEADING)}>
              Drivers
            </h2>
            <DriverStandingsTable rows={standings.drivers} />
          </section>
          <section aria-labelledby="constructors-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 id="constructors-heading" className={SECTION_HEADING}>
                Constructors
              </h2>
              <Link href="/teams" className={LINK}>
                Compare the teams →
              </Link>
            </div>
            <ConstructorStandingsTable rows={standings.constructors} />
          </section>
        </>
      )}
    </div>
  );
}

/** Placeholder rows in both sections' place, read out once rather than as a dozen empty rows. */
function LoadingState() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading standings…</p>
      {SKELETON_SECTIONS.map((section) => (
        <div key={section} aria-hidden="true" className="mb-16 space-y-3">
          <Skeleton className="mb-6 h-7 w-40 bg-zinc-800 motion-reduce:animate-none" />
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-9 w-full bg-zinc-900 motion-reduce:animate-none" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p className="text-sm text-zinc-300">Could not load the championship standings.</p>
      <button type="button" onClick={onRetry} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}

/**
 * A season with no race yet. Not an error — the route answers it with a 200 and empty tables —
 * so the page says what is true and offers last season's final table, not a retry that could
 * never succeed.
 */
function NotStartedState({
  year,
  onSelectYear,
}: {
  year: number;
  onSelectYear: (year: number) => void;
}) {
  const previous = year - 1;
  return (
    // A status, so a switch to this state is announced: the stamp's live region stays empty here.
    <div role="status" className="flex flex-col items-start gap-4">
      <p className="text-sm text-zinc-300">The {year} season hasn&#39;t started yet.</p>
      {previous >= STANDINGS_FIRST_YEAR && (
        <button type="button" onClick={() => onSelectYear(previous)} className={BUTTON}>
          See the {previous} final standings
        </button>
      )}
    </div>
  );
}
