import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { TeardownPageClient } from '@/components/teardown/teardown-page-client';

export const metadata: Metadata = {
  title: 'Anatomy of an F1 Car',
  description:
    'A scroll-driven teardown that reveals the engineering hidden inside an F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
};

/**
 * The nav sits outside the scene, beside its `<main>` rather than in it, the way every other route
 * renders it. The scene makes room for it itself: its own bar, its sticky viewport and its loading
 * overlay all start 56 px down (`teardown-scene.tsx`).
 */
export default function TeardownPage() {
  return (
    <>
      <LandingNav />
      <TeardownPageClient />
    </>
  );
}
