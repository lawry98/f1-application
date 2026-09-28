import { Skeleton } from '@/components/ui/skeleton';
import type { UseCircuitWinnersReturn } from '@/hooks/use-circuit-winners';
import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

const HEADING = 'mb-6 text-2xl font-black uppercase tracking-tight text-ink';
const CELL = 'py-3 pr-4 text-sm text-zinc-300';
const HEAD_CELL = 'pb-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const BUTTON = cn(
  'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700',
  focusRingOffsetBase,
);
const SKELETON_ROWS = ['a', 'b', 'c'] as const;

/**
 * The detail page's recent winners.
 *
 * Team names are plain text, no livery colour, for the reason `/standings` gives: a colour on
 * text needs its own backdrop variant, and a table row is not worth one. No `bg-` on any row.
 * The event name prints only in a year this circuit hosted two races (Spielberg, Silverstone and
 * Sakhir in 2020); otherwise it's the same Grand Prix every row and would be noise.
 */
export function CircuitWinners({ winners, loading, error, retry }: UseCircuitWinnersReturn) {
  const heading = winners ? `Winners, ${winners.from_year}–${winners.to_year}` : 'Recent winners';
  const span = winners ? `${winners.from_year}–${winners.to_year}` : '';
  const doubleYears = new Set(
    (winners?.winners ?? [])
      .map((row) => row.year)
      .filter((year, i, years) => years.indexOf(year) !== i),
  );

  return (
    <section aria-labelledby="winners-heading" className="mt-16">
      <h2 id="winners-heading" className={HEADING}>
        {heading}
      </h2>

      {loading && (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-zinc-400">Race results load on first view and can take a few seconds.</p>
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} aria-hidden="true" className="h-9 w-full bg-zinc-900 motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-sm text-zinc-300">Could not load this circuit&#39;s recent winners.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      )}

      {winners && winners.winners.length === 0 && (
        <p className="text-sm text-zinc-300">No Grand Prix here in {span}.</p>
      )}

      {winners && winners.winners.length > 0 && (
        <table className="w-full border-collapse">
          <caption className="sr-only">{heading}</caption>
          <thead>
            <tr className="border-b border-zinc-800">
              <th scope="col" className={HEAD_CELL}>Year</th>
              <th scope="col" className={HEAD_CELL}>Driver</th>
              <th scope="col" className={HEAD_CELL}>Team</th>
              <th scope="col" className={cn(HEAD_CELL, 'text-right')}>Time</th>
            </tr>
          </thead>
          <tbody>
            {winners.winners.map((row) => (
              <tr key={`${row.year}-${row.event}`} className="border-b border-zinc-900">
                <td className={cn(CELL, 'font-mono')}>
                  {row.year}
                  {doubleYears.has(row.year) && (
                    <span className="block font-sans text-xs text-zinc-400">{row.event}</span>
                  )}
                </td>
                <td className={cn(CELL, 'text-ink')}>{row.driver}</td>
                <td className={CELL}>{row.team}</td>
                <td className={cn(CELL, 'pr-0 text-right font-mono')}>{row.time ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {winners && winners.unavailable_years.length > 0 && (
        <p className="mt-4 text-sm text-zinc-400">
          Results for {winners.unavailable_years.join(', ')} could not be loaded.
        </p>
      )}
    </section>
  );
}
