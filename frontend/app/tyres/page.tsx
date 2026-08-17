import type { Metadata } from 'next';

import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';
import { TyresHero } from '@/components/tyres/tyres-hero';
import { CompoundExplorerSection } from '@/components/tyres/compound-explorer-section';
import { AllocationExplainer } from '@/components/tyres/allocation-explainer';
import { StrategyScenarios } from '@/components/tyres/strategy-scenarios';
import { TyreLifecycle } from '@/components/tyres/tyre-lifecycle';
import { TyreFaq } from '@/components/tyres/tyre-faq';
import { RelatedExperiences } from '@/components/tyres/related-experiences';

export const metadata: Metadata = {
  title: 'F1 Tyre Compounds',
  description:
    'How Formula 1 tyre compounds work — the season’s numbered dry range, how three of them become Hard, Medium and Soft at each Grand Prix, and what Intermediates and Full Wets are for.',
};

/**
 * Composes, does not contain — the same shape as the landing page. Every section is its own
 * component under `components/tyres/`, and every fact they render comes from
 * `data/tyres-data.ts` rather than from markup.
 *
 * Only the explorer is a client component; the rest of the page renders on the server.
 */
export default function TyresPage() {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-zinc-950">
        <TyresHero />
        <CompoundExplorerSection />
        <AllocationExplainer />
        <StrategyScenarios />
        <TyreLifecycle />
        <TyreFaq />
        <RelatedExperiences />
      </main>
      <LandingFooter />
    </>
  );
}
