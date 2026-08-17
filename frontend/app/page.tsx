import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingMarqueeBand } from '@/components/landing/landing-marquee-band';
import { LandingFeatures } from '@/components/landing/landing-features';
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works';
import { LandingBuiltWith } from '@/components/landing/landing-built-with';
import { LandingCtaBand } from '@/components/landing/landing-cta-band';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingSectionTheme } from '@/components/landing/landing-section-theme';

/**
 * The alternation, in one place.
 *
 * Every section below is wrapped rather than painting its own background, so this file is the
 * whole answer to "what colour is that band" — the section components carry no `bg-base` of their
 * own any more, and a wrapper's colour would be occluded by one if they did.
 *
 *   hero          base
 *   marquee       base-warm
 *   features      base
 *   how it works  base-warm
 *   built with    base
 *   cta           base-warm
 *   footer        — not wrapped; see below
 *
 * The hero is `base` because the page opens on the resting colour, and strict odd/even from there
 * puts the warm slab under the marquee, the timeline and the closing CTA — the three bands that
 * are already their own beat — while the two content grids stay on `base`.
 *
 * **The footer is deliberately outside this.** It already carries the alternation internally and
 * has since Phase 3: a `bg-base` landmark holding a `bg-base-warm` card, which is what makes its
 * `rounded-t-2xl` corners legible at all (the cut-away shows the darker landmark through them).
 * Wrapping it would paint warm behind that cut-away and silently undo the radius. Its `base`
 * landmark against the CTA band's warm is also what keeps the seam between the two visible.
 */
export default function Home() {
  return (
    <>
      <LandingNav />
      <main>
        <LandingSectionTheme tone="base">
          <LandingHero />
        </LandingSectionTheme>
        <LandingSectionTheme tone="base-warm">
          <LandingMarqueeBand />
        </LandingSectionTheme>
        <LandingSectionTheme tone="base">
          <LandingFeatures />
        </LandingSectionTheme>
        {/* Warm, and `landing-how-it-works.tsx`'s step numerals mask the connector line with
            `bg-base-warm` to match. The two must move together; that file says so too, and a test
            pins the pair. */}
        <LandingSectionTheme tone="base-warm">
          <LandingHowItWorks />
        </LandingSectionTheme>
        <LandingSectionTheme tone="base">
          <LandingBuiltWith />
        </LandingSectionTheme>
        {/* Warm, which is why this section's focus rings take `ring-offset-base-warm`. */}
        <LandingSectionTheme tone="base-warm">
          <LandingCtaBand />
        </LandingSectionTheme>
      </main>
      <LandingFooter />
    </>
  );
}
