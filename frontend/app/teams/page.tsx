import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { TeamsPageClient } from '@/components/teams/teams-page-client';

export const metadata: Metadata = {
  title: 'F1 Teams 2026',
  description:
    'Explore all 11 Formula 1 constructors competing in the 2026 season — drivers, liveries, and team profiles.',
};

export default function TeamsPage() {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <TeamsPageClient />
      </main>
    </>
  );
}
