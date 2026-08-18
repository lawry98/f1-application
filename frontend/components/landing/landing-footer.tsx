import Link from 'next/link';

import { RedactedReveal } from '@/components/candy/redacted-reveal';
import { TopoBackground } from '@/components/candy/topo-background';
import { focusRingOffsetBaseWarm } from '@/lib/focus';

export interface FooterNext {
  href: string;
  label: string;
}

export interface LandingFooterProps {
  /**
   * The one onward link the footer offers, as "what to read next".
   *
   * The footer used to render **every** `NAV_LINKS` entry, which put the complete primary
   * navigation on screen twice — once in the fixed header that is always visible, and again
   * 30px below it. The second copy answered no question the first had not: a reader at the foot
   * of the page can already see the header, and six identical 11px links are a worse answer to
   * "where now" than one deliberate one.
   *
   * Defaults to `/briefing`, the app's primary destination, so the prop is an override rather
   * than a requirement — a page that forgets it still gets a sensible onward journey.
   */
  next?: FooterNext;
}

const DEFAULT_NEXT: FooterNext = { href: '/briefing', label: 'Race weekend briefing' };

/**
 * Shared link chrome. The ring rule and its measurements are in `lib/focus.ts`.
 *
 * Every link in the footer carries the same one, including the two outbound attribution links,
 * which before this branch had none — a keyboard user tabbing through the legal line had no
 * visible focus at all. `base-warm` and not `base` because the card these links sit on is
 * `#140B0B`; the offset gap is painted in the colour it names, so naming the page background
 * would draw a visible cold halo around every focused link.
 */
const FOCUS_RING = focusRingOffsetBaseWarm;

/**
 * The sign-off's type scale, shared by both lines so the display and serif runs sit on one
 * optical size. Tailwind arbitrary values must contain **no spaces** inside the parentheses —
 * `clamp(2rem, 5vw, 4.5rem)` with the spaces the CSS spec allows is silently dropped by the
 * class scanner and the text renders at the inherited size.
 *
 * The 2rem floor is what makes the red serif line legal: `f1-red` on this background measures
 * ~4.01:1, which clears WCAG's 3:1 large-text bar but not the 4.5:1 small-text one, so red is
 * only permitted above ~24px. 32px is the smallest this line can ever be.
 */
const SIGN_OFF_TYPE = 'text-[clamp(2rem,5vw,4.5rem)] leading-[0.9] tracking-tight';

export function LandingFooter({ next = DEFAULT_NEXT }: LandingFooterProps = {}) {
  return (
    /*
     * Two layers on purpose: the `<footer>` landmark carries `bg-base` and the card inside it
     * carries `bg-base-warm`.
     *
     * `rounded-t-2xl` is the one thing in this section that silently does nothing if you get the
     * stack wrong. A radius only reads if something *different* shows through the corner it cuts
     * away, and the previous footer was `bg-zinc-950` on a `#09090B` body — the cut-out would
     * have been dark-on-dark and invisible. So:
     *
     *   1. the landmark is explicitly `bg-base`, so whatever the section above it ends in, the
     *      16px the corners cut away is page background, not more footer; and
     *   2. the card carries `border-t border-white/10`, which follows the radius and traces the
     *      arc as a hairline.
     *
     * (2) is doing most of the work: `base` (#09090B) against `base-warm` (#140B0B) differ by 11
     * levels of red and nothing else, which is enough to feel as a warm slab across a whole
     * section but not enough to draw a 16px arc on its own. The hairline is what actually makes
     * the corner a shape.
     *
     * The card is full-bleed — no `max-w` on it — so the corners land at the viewport edges and
     * the slab reads as the thing the page ends on. Only the content inside is constrained.
     */
    <footer className="bg-base" aria-label="Site footer">
      <div className="relative overflow-hidden rounded-t-2xl border-t border-white/10 bg-base-warm">
        {/* `overflow-hidden` above is what clips the texture to the rounded corners; without it
            the contours paint square right through the arc and undo the radius. */}
        <TopoBackground className="text-ink opacity-[0.07]" />

        {/* `relative` lifts the content above the absolutely positioned texture. Without it the
            positioned SVG paints over in-flow content in the same stacking context. */}
        <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-16">
          {/*
           * The sign-off. `RedactedReveal` emits one `inline-block` element per child and no
           * outer wrapper, so without a block context both lines would sit side by side on one
           * row. `items-start` is load-bearing: under the default `stretch` every line's bar
           * widens to the full column and the staircase's uneven bar widths all resolve to the
           * same width, which is the effect.
           *
           * The case is written into the markup rather than left to `uppercase` alone, because
           * the accessible name of a landmark's dominant text should be what a reader sees —
           * and because a test asserting `LIGHTS OUT.` reads `textContent`, which `uppercase`
           * (a paint-time transform) does not touch.
           */}
          <div className="flex flex-col items-start">
            <RedactedReveal variant="ink">
              <span className={`font-display uppercase text-ink ${SIGN_OFF_TYPE}`}>
                LIGHTS OUT.
              </span>
              {/* Red, not ink: this is the page's one closing accent and at 32px+ it is large
                  type, where red is permitted. Sentence case against the display line's caps is
                  the contrast the whole treatment is for, so no `uppercase` here. */}
              <span className={`font-serif-display italic text-f1-red ${SIGN_OFF_TYPE}`}>
                data in.
              </span>
            </RedactedReveal>
          </div>

          <div className="mt-14 flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            {/* Brand */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                {/* The MegaStat tick, matching the section kickers elsewhere on the page — a red
                    bar carrying the colour instead of small red text. */}
                <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
                <span className="font-display text-sm uppercase tracking-tight text-ink">
                  F1 Briefing Agent
                </span>
              </div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                AI-powered race weekend intelligence
              </p>
            </div>

            {/* One onward link, not a second copy of the header. See `LandingFooterProps.next`. */}
            <nav aria-label="Continue reading">
              <Link
                href={next.href}
                className={`group inline-flex items-baseline gap-3 ${FOCUS_RING}`}
              >
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Next</span>
                <span className="font-display text-lg uppercase tracking-tight text-ink transition-colors group-hover:text-f1-red sm:text-xl">
                  {next.label}
                </span>
                <span
                  aria-hidden="true"
                  className="text-f1-red transition-transform duration-300 ease-out-expo group-hover:translate-x-1"
                >
                  &rarr;
                </span>
              </Link>
            </nav>
          </div>

          <div className="my-8 h-px w-full bg-white/10" role="separator" aria-hidden="true" />

          {/* Legal. Deliberately *not* uppercase-tracked like the labels above — this is prose,
              and 11px letter-spaced caps is unreadable at sentence length. */}
          <div className="flex flex-col items-start justify-between gap-3 text-[11px] leading-relaxed text-zinc-400 sm:flex-row sm:items-center">
            <p>
              Data from{' '}
              <a
                href="https://theoehrly.github.io/Fast-F1/"
                target="_blank"
                rel="noopener noreferrer"
                className={`underline underline-offset-2 transition-colors hover:text-zinc-300 ${FOCUS_RING}`}
              >
                FastF1
              </a>
              {' & '}
              <a
                href="https://openweathermap.org/"
                target="_blank"
                rel="noopener noreferrer"
                className={`underline underline-offset-2 transition-colors hover:text-zinc-300 ${FOCUS_RING}`}
              >
                OpenWeather
              </a>
              . F1 car model CC BY 4.0.
            </p>
            <p>Built with Gemini 3.6 Flash &middot; Not affiliated with Formula 1 or the FIA.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
