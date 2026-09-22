import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { StandingsPageClient } from '@/components/standings/standings-page-client';
import { parseStandingsYear, STANDINGS_FIRST_YEAR } from '@/lib/standings';

export const metadata: Metadata = {
  title: 'F1 Championship Standings',
  description: `The drivers' and constructors' championship tables for every Formula 1 season since ${STANDINGS_FIRST_YEAR}, summed from each race's results.`,
};

interface StandingsPageProps {
  searchParams: { year?: string | string[] };
}

/**
 * `/standings`.
 *
 * The clock and `?year=` are both read **here, on the server**, and handed down as props, so the
 * client never calls `new Date()` during render and cannot hydrate a different season either
 * side of midnight on New Year's Eve — the trap `use-races.ts` documents. Reading `searchParams`
 * also makes the route dynamic, which a live table wants anyway.
 */
export default function StandingsPage({ searchParams }: StandingsPageProps) {
  const latestYear = new Date().getFullYear();
  const initialYear = parseStandingsYear(searchParams.year, latestYear);

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <StandingsPageClient initialYear={initialYear} latestYear={latestYear} />
      </main>
    </>
  );
}
