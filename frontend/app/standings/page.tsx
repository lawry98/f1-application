import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { StandingsPageClient } from '@/components/standings/standings-page-client';
import { STANDINGS_FIRST_YEAR } from '@/lib/standings';

export const metadata: Metadata = {
  title: 'F1 Championship Standings',
  description: `The drivers' and constructors' championship tables for every Formula 1 season since ${STANDINGS_FIRST_YEAR}, summed from each race's results.`,
};

/**
 * Rendered per request. `latestYear` is read from the server's clock, and a prerendered page
 * would freeze it at build time — a build from December would open on last season all year. A
 * static page would also need a Suspense boundary around the client's `useSearchParams`.
 */
export const dynamic = 'force-dynamic';

/**
 * `/standings`.
 *
 * The clock is read **here, on the server**, and handed down as a prop, so the client never
 * calls `new Date()` during render and cannot hydrate a different season either side of
 * midnight on New Year's Eve — the trap `use-races.ts` documents. `?year=` is deliberately *not*
 * read here: the client reads it from `useSearchParams`, because a season seeded from a server
 * prop desyncs from the URL on Back and on a same-page link (see `StandingsPageClient`).
 */
export default function StandingsPage() {
  const latestYear = new Date().getFullYear();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <StandingsPageClient latestYear={latestYear} />
      </main>
    </>
  );
}
