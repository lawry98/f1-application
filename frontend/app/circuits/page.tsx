import type { Metadata } from 'next';

import { CircuitsPageClient } from '@/components/circuits/circuits-page-client';
import { LandingNav } from '@/components/landing/landing-nav';

export const metadata: Metadata = {
  title: 'F1 Circuits',
  description: 'Every round of a Formula 1 season, drawn from each circuit’s surveyed outline.',
};

/**
 * Rendered per request, for `/standings`' two reasons: `latestYear` is read from the server's
 * clock, and a static page would need a Suspense boundary around the client's `useSearchParams`.
 */
export const dynamic = 'force-dynamic';

/** `/circuits`. `?year=` is read by the client, never here — see `CircuitsPageClient`. */
export default function CircuitsPage() {
  const latestYear = new Date().getFullYear();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <CircuitsPageClient latestYear={latestYear} />
      </main>
    </>
  );
}
