import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CircuitDetailClient } from '@/components/circuits/circuit-detail-client';
import { LandingNav } from '@/components/landing/landing-nav';
import { loadCircuit } from '@/lib/circuit-geometry';
import { resolveCircuitRoute } from '@/lib/circuit-route';

/** Per request for the same reasons as `/circuits`: the server clock, and `useSearchParams`. */
export const dynamic = 'force-dynamic';

interface CircuitPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: CircuitPageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = resolveCircuitRoute(slug, undefined);
  if (route.kind === 'notFound') return { title: 'Circuit not found' };
  // `render` and `redirect` both carry the canonical entry — a redirect still streams this
  // metadata for the moment before the client redirect lands, so it should name the circuit
  // it is redirecting to rather than say "Circuit not found".
  return {
    title: `${route.entry.name} — F1 Circuits`,
    description: `${route.entry.name}, ${route.entry.location}: its outline, length, first Grand Prix and recent winners.`,
  };
}

/**
 * `/circuits/[slug]`. The outline is loaded **here**, on the server, and handed down as props,
 * so the page ships no geometry chunk. An alias slug redirects so each circuit has one URL. The
 * rules live in `resolveCircuitRoute`, because RTL cannot render an async server component.
 */
export default async function CircuitPage({ params, searchParams }: CircuitPageProps) {
  const [{ slug }, { year }] = await Promise.all([params, searchParams]);
  const route = resolveCircuitRoute(slug, year);
  if (route.kind === 'notFound') notFound();
  if (route.kind === 'redirect') redirect(route.to);

  const geometry = await loadCircuit(route.entry.id);
  if (!geometry) notFound();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950 pt-14">
        <CircuitDetailClient circuit={route.entry} points={geometry.points} latestYear={new Date().getFullYear()} />
      </main>
    </>
  );
}
