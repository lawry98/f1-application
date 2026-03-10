import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingFeatures } from '@/components/landing/landing-features';
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works';
import { LandingBuiltWith } from '@/components/landing/landing-built-with';
import { LandingCtaBand } from '@/components/landing/landing-cta-band';
import { LandingFooter } from '@/components/landing/landing-footer';

export default function Home() {
  return (
    <>
      <LandingNav />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingBuiltWith />
        <LandingCtaBand />
      </main>
      <LandingFooter />
    </>
  );
}
