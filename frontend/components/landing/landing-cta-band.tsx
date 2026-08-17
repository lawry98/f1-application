import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';
import { Scribble } from '@/components/candy/scribble';
import { TopoBackground } from '@/components/candy/topo-background';
import { focusRingOffsetBaseWarm, focusRingOnRedFill } from '@/lib/focus';
import { cn } from '@/lib/utils';

/**
 * Why the Scribble's `delay` is 0.45 s and not 0.
 *
 * The whole block sits inside a `BlurFadeReduced`, which delegates to `BlurFade` on the
 * un-reduced path — so the timing below is `BlurFade`'s: `delay: 0.04 + delay` over
 * `duration: 0.4` — so the heading has finished un-blurring at 0.44 s. Drawn at 0 the circle
 * completes (0.8 s draw, but the first ~400 ms of it) while the text behind it is still blurred and
 * translating, which reads as the mark being *part of* the fade-in rather than as an annotation
 * made afterwards. That "already there" quality is the one thing a draw-on exists to avoid, and it
 * is the same reason `ScribbleProps.delay` exists at all.
 *
 * `draw` is left at its default `onView`: the heading is not under a `RedactedReveal`, so there is
 * no bar to wait for, and `onView` is what keeps the mark from drawing itself off-screen.
 */
const SCRIBBLE_DELAY_SECONDS = 0.45;

export function LandingCtaBand() {
  return (
    // No `bg-*`: `app/page.tsx` wraps every landing section in a `LandingSectionTheme` that owns
    // the surface colour, and a background here would paint over it. This band's tone is
    // `base-warm`, which is what the focus-ring offsets below are matched to.
    <section className="relative overflow-hidden py-28" aria-labelledby="cta-heading">
      {/*
       * Background. Both classes are load-bearing.
       *
       * `text-ink` is not optional: `TopoBackground` strokes `currentColor` and sets no colour of
       * its own, and nothing in this section's ancestry declares one, so a bare instance resolves
       * to `rgb(0, 0, 0)` — black contours over #09090B, i.e. an *absent* texture that is
       * indistinguishable from a tasteful one until you sample the colour.
       *
       * 0.07 rather than the component's own 0.12 default: at 12% over a full-bleed section the
       * contours cross the headline and read as illustration competing with the type. The kit's
       * docstring records 5% as invisible on a real display and 6% as legible only if you know to
       * look, so 7% is the first step above that. The hero and the footer carry the identical
       * class — the three full-section textures are one material and must be edited together.
       */}
      <TopoBackground className="text-ink opacity-[0.07]" />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="h-[600px] w-[600px] rounded-full bg-red-600/[0.08] blur-3xl" />
      </div>

      {/*
       * `px-6`, not the `px-4` this had before. The circle scribble's overlay is
       * `-inset-x-[5%]`, i.e. it deliberately overhangs the phrase it marks by 5% of that phrase's
       * width on each side. At 375 px the container is the only gutter the mark has, and 16 px of
       * it left the overhang within a few pixels of the viewport edge on the narrowest phones. This
       * is the change the brief sanctions — widen the container, never shrink the mark, because the
       * overhang is what stops the circle reading as a border-radius.
       */}
      <div className="container relative mx-auto max-w-4xl px-6 text-center">
        <BlurFadeReduced inView delay={0} direction="up">
          {/*
           * The kicker used to be `text-sm … text-f1-red`, which is small red text: #E10600 on
           * #09090B measures 4.01:1, over WCAG's 3:1 large-text bar but under the 4.5:1 small-text
           * one. The colour moves into a decorative bar (unconstrained) and the words go grey.
           */}
          <p className="mb-4 flex items-center justify-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
            Ready to get started?
          </p>

          {/*
           * The accent run stays `ink`, and the red arrives only as the scribble. This is the
           * choice the brief offered first and it is the right one here for a reason specific to
           * `circle`: unlike `underline` or `strike`, the mark encloses its words rather than
           * crossing them, so a red stroke and red glyphs sit inside one another with no value
           * separation and the whole phrase muddies into a single red smear at a glance. Ink
           * glyphs inside a red ring keep the ring reading as a ring. The `f1-red` serif accent
           * every other section heading uses is therefore deliberately *not* applied to this one —
           * the scribble is already carrying this section's ration of red.
           *
           * Consequently the Scribble needs no `[&_svg]:text-…` recolour: it keeps its own
           * `text-f1-red`. If this is ever flipped to a red accent run, the mark must be recoloured
           * with `className="[&_svg]:text-ink"` and never `className="text-ink"` — the wrapper's
           * text colour cascades into the children and would tint the headline itself.
           *
           * `text-balance` rather than a `<br />`: the full string measures wider than the
           * `max-w-4xl` column at `lg:text-5xl`, so it wraps to two lines on its own, but the
           * natural break point lands within a few pixels of "briefing," and a hard `<br />` would
           * be wrong at every width below that. Balancing splits it as the composition wants and
           * degrades to ordinary wrapping where `text-wrap: balance` is unsupported.
           */}
          <h2
            id="cta-heading"
            className="mb-6 text-balance font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
          >
            Your race weekend briefing,{' '}
            <span className="font-serif-display text-[1.05em] normal-case italic">
              <Scribble type="circle" delay={SCRIBBLE_DELAY_SECONDS}>
                one click
              </Scribble>{' '}
              away.
            </span>
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
            No setup, no account required. Enter any Grand Prix name and receive a comprehensive
            AI-generated briefing in seconds.
          </p>

          {/*
           * The red pill / dark pill pair. `landing-hero.tsx` and `teardown-outro.tsx` carry the
           * identical strings, and any divergence between them shows up on one scroll. White on
           * #E10600 is 5.0:1, so the 12 px label clears AA. `hover:bg-[#B80500]` rather than
           * `hover:bg-red-700`: Tailwind's red-700 (#B91C1C) is a different hue from the brand red
           * and reads as the button changing colour instead of darkening.
           *
           * Focus rings: the rule and every measurement behind it live in `lib/focus.ts`. The
           * offsets are `base-warm` and not `base` here — this is one of the alternating warm
           * sections (`components/landing/landing-section-theme.tsx`), and the offset band is
           * painted in the colour it names, so a `base` band on a warm section draws a visible cold
           * halo. A ring is only ever seen while its control is focused, which means the section is
           * on screen, which means `LandingSectionTheme` has already settled it to warm.
           */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className={cn(
                'rounded-full bg-f1-red px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#B80500]',
                focusRingOnRedFill,
                'focus-visible:ring-offset-base-warm',
              )}
            >
              <Link href="/briefing">
                Generate a Briefing
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className={cn(
                'rounded-full border-white/15 bg-white/[0.02] px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-ink',
                focusRingOffsetBaseWarm,
              )}
            >
              <Link href="/teardown">Explore Car Anatomy</Link>
            </Button>
          </div>
        </BlurFadeReduced>
      </div>
    </section>
  );
}
