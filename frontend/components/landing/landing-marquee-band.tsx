import { DoubleMarquee } from '@/components/candy/double-marquee';

/**
 * The decorative ticker band between the hero and the features grid.
 *
 * Purely ornamental: it carries no copy the page depends on, and "lights out / and away we go"
 * is the F1 race-start call, not information. Every consequence below follows from that.
 *
 * **A `div`, not a `section`.** A `<section>` only becomes a `region` landmark once it has an
 * accessible name, so an unnamed one would be harmless in the accessibility tree — but it would
 * still read as a peer of `#features` and `#how-it-works` to anyone scanning the markup, and the
 * next person to touch it would reach for an `aria-labelledby`. A `div` says "not a section of
 * this document" without depending on that subtlety. Deliberately no `id` either: the band is not
 * a nav target, and `components/landing/links.ts` must stay the complete list of anchors.
 *
 * **No `aria-hidden` on this wrapper, on purpose.** Both children already carry their own —
 * `DoubleMarquee` sets `aria-hidden="true"` on its root (verified in
 * `components/candy/double-marquee.tsx`; it hides the whole component, not each row, precisely
 * because each row repeats its text twice and would otherwise be announced doubled), and the glow
 * below sets its own. Hiding the wrapper as well would be redundant today and a trap tomorrow: an
 * `aria-hidden` container silently swallows anything later added inside it, including a real
 * heading, with no error and no visual symptom. Hiding at the leaves keeps that failure loud.
 */
export function LandingMarqueeBand() {
  return (
    /*
     * `overflow-hidden` is the single load-bearing class here. `DoubleMarquee`'s track is exactly
     * twice the viewport width by construction (two copies of the text, so the -50% keyframe
     * loops seamlessly), and its own rows clip themselves — but the animated track is transformed,
     * and a transform that overhangs still extends the scrollable overflow area of an ancestor.
     * Without this the page gains a horizontal scrollbar on every viewport. jsdom cannot see that,
     * so the class is all a test can pin; see the test file.
     *
     * Full-bleed with no negative margins: this band is a direct child of `<main>`, between two
     * full-width sections that put their own `container mx-auto max-w-7xl px-4` *inside*
     * themselves. There is no padding here to cancel, so `/candy`'s `-mx-6 md:-mx-12` hack — which
     * exists only because the styleguide page pads its sections — would push the marquee past the
     * viewport edges and defeat the `overflow-hidden` above.
     *
     * `bg-base` (#09090B) continues the page rather than alternating: Phase 7 owns section
     * theming, and a `base-warm` strip here would pre-empt a decision that has to be made across
     * all sections at once.
     *
     * Rhythm: `py-16 md:py-24`. The marquee is two 7vw lines at `leading-[0.85]`, so it is already
     * ~12vw of ink; a full `py-28` (what the CTA band uses) would make this decorative strip the
     * tallest block on the page. `py-24` still lands just under the features section's own `py-24`
     * top padding, which is what makes the band read as its own beat rather than as a strip glued
     * to the bottom of the hero.
     */
    <div className="relative overflow-hidden bg-base py-16 md:py-24">
      {/*
       * Soft red glow, in the same idiom as `landing-hero.tsx` and `landing-cta-band.tsx`:
       * an absolutely positioned, `blur-3xl`, very low-alpha red disc. Absolute positioning is
       * what keeps CLS at 0 — it never participates in layout, so it cannot move the marquee.
       *
       * Wider than tall (`w-[900px] h-[420px]`) unlike the neighbours' squares, because this band
       * is a wide, short strip: a 600px circle would leave the two ends of the marquee unlit and
       * read as a spotlight on the middle word rather than as a wash behind the whole ticker.
       */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="h-[420px] w-[900px] rounded-full bg-red-600/[0.08] blur-3xl" />
      </div>

      {/* `relative` only to sit above the absolutely positioned glow — no z-index needed, since a
          positioned element already paints over a positioned earlier sibling with `z-index: auto`. */}
      <div className="relative">
        <DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />
      </div>
    </div>
  );
}
