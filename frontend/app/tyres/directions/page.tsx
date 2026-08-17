import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { DirectionsPreview } from '@/components/tyres/lab/directions-preview';

/**
 * A scratch route for choosing the `/tyres` art direction.
 *
 * Deliberately absent from `NAV_LINKS` — like `/candy`, this is a working surface, not a
 * destination. It is expected to be deleted once a direction is chosen; only the `lab/` SVG
 * engine underneath it survives into the real page.
 */
export const metadata: Metadata = {
  title: 'Tyre Lab · direction preview',
  robots: { index: false, follow: false },
};

export default function TyreDirectionsPage() {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-base pt-14">
        <DirectionsPreview />
      </main>
    </>
  );
}
