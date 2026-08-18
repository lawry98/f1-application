import type { Metadata } from 'next';

import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingNav } from '@/components/landing/landing-nav';
import { ActAllocation } from '@/components/tyres/acts/act-allocation';
import { ActLifecycle } from '@/components/tyres/acts/act-lifecycle';
import { ActStrategy } from '@/components/tyres/acts/act-strategy';
import { TyreLab } from '@/components/tyres/acts/tyre-lab';
import { TyreArchive } from '@/components/tyres/acts/tyre-archive';
import { TYRES_SEASON } from '@/data/tyres-data';

export const metadata: Metadata = {
  title: 'Tyre Lab',
  description:
    'How Formula 1 tyre compounds work — the season’s numbered dry range, how three of them become Hard, Medium and Soft at each Grand Prix, and what Intermediates and Full Wets are for.',
  openGraph: {
    title: `F1 Tyre Lab — the ${TYRES_SEASON} compounds`,
    description:
      'An interactive tyre laboratory: five compounds, the weekend allocation that names three of them, strategy by scenario, and the life of a tyre from blanket to recycling.',
    type: 'article',
  },
};

/**
 * `/tyres` — the Tyre Lab.
 *
 * Four acts, each its own visual environment rather than four content blocks in one:
 *
 *   1  Stage       the selector, the render at size, three numbers
 *   2  Compound    the attack scale, one compound at depth, notes behind a disclosure
 *   3  Allocation  the C1-C5 rail and the lens that names three of them
 *   3b Strategy    six scenarios, each repainting the section
 *   4  Lifecycle   eight stages driving the drawn tyre through wear and heat
 *
 * Acts 1 and 2 share one selection and therefore one client boundary (`TyreLab`). Acts 3, 3b and
 * 4 own their own. The tones alternate `base` / `base-warm` down the page, which is the pacing
 * device `/` already uses.
 *
 * The page composes; it contains no markup of its own beyond the landmarks.
 */
export default function TyresPage() {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-base pt-14">
        <TyreLab />
        <ActAllocation />
        <ActStrategy />
        <ActLifecycle />
        <TyreArchive />
      </main>
      {/* One onward link, not a second copy of the header nav. Car Anatomy because it is the
          other "how the machine works" experience, and the reader who just took a tyre apart is
          the reader most likely to want the car. */}
      <LandingFooter next={{ href: '/teardown', label: 'Car Anatomy' }} />
    </>
  );
}
