import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CircuitGlow } from '@/components/candy/circuit-glow';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import { Scribble } from '@/components/candy/scribble';
import { TicketCard } from '@/components/candy/ticket-card';
import { TopoBackground } from '@/components/candy/topo-background';
import monaco from '@/data/circuits/mc-1929.json';
import { toPoints } from '@/lib/circuit-geometry';
import { cn } from '@/lib/utils';

/**
 * Hoisted to module scope so the conversion runs once per process rather than once per render of
 * the preview card. 154 points through `map` is cheap, but the array identity matters more than
 * the cost: `CircuitGlow` memoises its scaling and its path string on `points`, and a fresh array
 * every render would invalidate both `useMemo`s on every parent re-render.
 */
const MONACO_POINTS = toPoints(monaco.points);

/**
 * Seconds before the underline under "INTEL," starts drawing.
 *
 * Not a taste number. `RedactedReveal`'s bar takes 650 ms to wipe and this is the *second* line, so
 * its bar starts 100 ms into the sequence (`LINE_STAGGER_S`) and finishes at ~750 ms. A mark drawn
 * at 0 would be complete and hidden behind the bar before the bar ever clears, so the annotation
 * would never appear to be *made* — it would simply already be there, which is the one outcome the
 * draw-on exists to avoid. 0.9 s puts the first stroke ~150 ms after the bar is gone.
 */
const SCRIBBLE_DELAY_S = 0.9;

/**
 * The trailing-space idiom used on the first two headline lines.
 *
 * `RedactedReveal` renders each line as its own `inline-block` element, so the lines' text nodes
 * butt straight up against each other in `textContent` — without these the accessible text reads
 * "Race weekendintel,before the lights go out." A trailing space inside an inline-block collapses
 * at the end of the line box, so it costs nothing visually.
 */
const LINE_GAP = ' ';

export function LandingHero() {
  return (
    <section className="relative flex min-h-[calc(100vh-3.5rem)] items-center overflow-hidden bg-base pt-14">
      {/*
       * The contour texture positions and hides itself — `absolute inset-0` and `aria-hidden` live
       * inside the component — so the `relative` on the section above is what its `inset-0`
       * resolves against; drop it and the texture escapes to the nearest positioned ancestor.
       *
       * `text-ink` is not optional here. `TopoBackground` strokes `currentColor` and sets no colour
       * of its own, and nothing in this section's ancestry declares one — measured in Chromium, a
       * bare `<TopoBackground />` resolved to `rgb(0, 0, 0)`, i.e. black contours over `#09090B`.
       * The texture was not subtle, it was absent, and the page looked correct because an invisible
       * texture and a tasteful one are indistinguishable until you sample the colour.
       *
       * 0.07 rather than the component's own 0.12 default: at 12% over a full-bleed section the
       * contours cross the headline and read as illustration competing with the type instead of as
       * paper. The kit's docstring records 5% as invisible on a real display and 6% as legible only
       * if you know to look — 7% is the first step above that. The CTA band and the footer carry
       * the identical class so the three full-section textures are one material.
       */}
      <TopoBackground className="text-ink opacity-[0.07]" />

      {/* Ambient glows */}
      <div
        className="pointer-events-none absolute -left-32 top-1/3 h-[700px] w-[700px] -translate-y-1/2 rounded-full bg-red-600/[0.08] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-red-600/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="container relative mx-auto max-w-7xl px-4 py-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_440px] lg:gap-16 xl:grid-cols-[1fr_500px]">
          {/* Left column: copy + CTAs */}
          <div className="space-y-8">
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300">
              <Zap className="mr-1.5 h-3 w-3 text-f1-red" aria-hidden="true" />
              Gemini 3.6 Flash &middot; LangGraph &middot; FastF1
            </Badge>

            <div className="space-y-5">
              {/*
               * The `h1` is the flex column *around* the reveal, not the reveal itself.
               *
               * `RedactedReveal` renders one element per child with no wrapper, so `as="h1"` would
               * emit **three** `h1`s — one per line — and split the sentence into three separate
               * headings in the accessibility tree. Keeping the `h1` outside means one heading
               * whose accessible text is the whole sentence, with the reveal's per-line elements
               * as its children. `flex flex-col` supplies the block context the lines would
               * otherwise lack (they are `inline-block` and would sit side by side), and
               * `items-start` is load-bearing: `items-stretch` widens every line to the column, so
               * the staircase's deliberately uneven bar widths would all resolve to one width.
               *
               * The font size lives here rather than on each line so the serif line's `0.55em` has
               * the display size to resolve against — `em` on a sibling would measure the 16px
               * page default instead.
               */}
              <h1 className="flex flex-col items-start font-display text-[clamp(3.5rem,9vw,8rem)] uppercase leading-[0.9] tracking-tight text-ink">
                <RedactedReveal variant="accent">
                  <span>Race weekend{LINE_GAP}</span>
                  <span>
                    {/*
                     * No `text-…` on the Scribble's own className: it lands on the wrapper and
                     * cascades into the annotated word, tinting the headline along with the mark.
                     * The mark's colour comes from `text-f1-red` on its own `<svg>`, so inheriting
                     * `text-ink` from the `h1` cannot touch it.
                     */}
                    {/*
                     * The stroke is thinned *here*, at the call site, rather than in the kit.
                     *
                     * `Scribble` deliberately lets its stroke scale with whatever it annotates — a
                     * marker held over bigger letters leaves a bigger mark. Measured on this
                     * headline in Chromium at 1440×900: the mark renders 385.4 × 43.8 against its
                     * 220 × 22 viewBox, so 1.75× horizontally against 1.99× vertically. That ratio
                     * is the good news — it is near-uniform, so the "inconsistent width within one
                     * mark" failure predicted for a full-line underline does **not** happen when
                     * the mark is scoped to a single word. What does happen is that the kit's
                     * `strokeWidth: 4`, tuned to land ~2.4px over `text-2xl`, comes out at
                     * 4 × ~1.87 = ~7.5px here — a painted ribbon, not the 2–3px pen the brief asks
                     * for.
                     *
                     * 1.5 × ~1.87 = ~2.8px, back inside the brief. A CSS `stroke-width` beats the
                     * SVG presentation attribute on specificity, so no kit change is needed, and
                     * nothing here touches `pathLength` or the dash pattern — `vector-effect:
                     * non-scaling-stroke` is ruled out for this component and stays ruled out.
                     *
                     * It has to be two values, because a CSS `stroke-width` is the one part of this
                     * mark that does **not** scale with the headline. At 390 the clamp bottoms out
                     * and the word measures 173.1 × 19.1, a scale of 0.79 × 0.87 — so the same 1.5
                     * renders 1.24px, a hairline. 3 at the mobile end lands at ~2.5px. Both ends
                     * are now inside 2–3px, which one fixed number cannot achieve across a clamp
                     * with a 2.3× range.
                     */}
                    <Scribble
                      type="underline"
                      delay={SCRIBBLE_DELAY_S}
                      className="[&_svg]:[stroke-width:3] md:[&_svg]:[stroke-width:1.5]"
                    >
                      intel,
                    </Scribble>
                    {LINE_GAP}
                  </span>
                  {/* Third line of the same headline, not a caption: 0.55em of the display clamp
                      is ~70px at the clamp's ceiling. `normal-case` because the serif accent stays
                      sentence-case — that contrast against the caps above it is the point. */}
                  <span className="font-serif-display text-[0.55em] normal-case italic text-f1-red">
                    before the lights go out.
                  </span>
                </RedactedReveal>
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-zinc-400">
                Type any Grand Prix and our AI agent gathers track telemetry, driver form, weather
                forecasts, and live news — synthesized into a structured race weekend briefing by
                Claude AI.
              </p>
            </div>

            {/*
             * The focus rings are the one part of this pill pair that cannot be chosen by eye.
             *
             * `components/ui/button.tsx` ships `focus-visible:ring-1 focus-visible:ring-ring` and
             * **no ring-offset**, so an override only names a colour and the ring is painted flush
             * against the button's own fill. WCAG 2.4.11 wants 3:1 between the indicator and what
             * it sits against, and the obvious choices both fail that against the adjacent colour:
             * `ring-f1-red` on `bg-f1-red` is 1.00:1 — a red ring on a red button, i.e. invisible —
             * and `ring-zinc-600` on the outline pill's `bg-white/[0.02]` over `base` is 2.57:1.
             *
             * So each ring takes the *other* pill's colour and an explicit offset, which puts a
             * 2px band of page background between ring and fill and gives the ring a background it
             * actually contrasts with. `landing-cta-band.tsx` and `teardown-outro.tsx` carry the
             * identical strings; `landing-footer.tsx` is the same shape with `ring-offset-base-warm`
             * because its links sit on the warm card, not on `base`.
             */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-f1-red px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#B80500] focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-base"
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
                className="rounded-full border-white/15 bg-white/[0.02] px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-ink focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              >
                <Link href="/teardown">Explore Car Anatomy</Link>
              </Button>
            </div>

            {/* Same small-caps voice as the section kickers, so the page has one label register
                rather than a `text-sm` one here and an 11px one everywhere else. */}
            <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-6 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              <span>Multi-source data</span>
              <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden="true" />
              <span>Real-time streaming</span>
              <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden="true" />
              <span>Tool trace transparency</span>
            </div>
          </div>

          {/* Right column: briefing preview card */}
          <div className="hidden lg:block">
            <HeroBriefingPreview />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade. `from-base` rather than `from-zinc-950` to match the section's own
          background token — the two hex values are identical, so this is a rename, not a change. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-base to-transparent"
        aria-hidden="true"
      />
    </section>
  );
}

function HeroBriefingPreview() {
  const tools: Array<{ label: string; ok: boolean }> = [
    { label: 'Track telemetry', ok: true },
    { label: 'Driver form', ok: true },
    { label: 'Weather forecast', ok: true },
    { label: 'News search', ok: true },
  ];

  return (
    <div className="relative select-none">
      {/* Outer glow. Kept from the previous card — TicketCard brings its own border, background,
          notch and texture, so the hand-rolled `rounded-xl border bg-zinc-900/95` panel that used
          to sit here is gone rather than nested inside it. */}
      <div
        className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-red-600/20 via-transparent to-transparent blur-xl"
        aria-hidden="true"
      />

      {/* No `relative` needed on the card: `TicketCard` already carries it, which puts it in the
          same "positioned, z-index:auto" paint bucket as the glow above and later in tree order —
          so it paints on top without a z-index. */}
      <TicketCard
        kicker="RACE BRIEFING · RND.08"
        divide="y"
        footer={
          <>
            <p className="mb-2.5 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              Agent tool trace
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {tools.map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                      ok ? 'bg-green-500' : 'bg-red-500',
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] text-zinc-400">{label}</span>
                </div>
              ))}
            </div>
          </>
        }
      >
        {/* Header row. `TicketCard`'s content slot carries no padding of its own, so every child
            below supplies `px-4`. */}
        <div className="flex items-center gap-4 px-4 py-4">
          {/* `aspect-square` because CircuitGlow's user space is square and it letterboxes with
              `xMidYMid meet` — a non-square box would draw the lap smaller with dead space either
              side rather than filling. No `corners`: the numbers are illegible at this size. */}
          <div className="aspect-square w-[120px] flex-shrink-0">
            <CircuitGlow points={MONACO_POINTS} variant="plain" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg uppercase leading-tight tracking-tight text-ink">
              Monaco Grand Prix
            </h3>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden="true" />
              Ready
            </span>
          </div>
        </div>

        <PreviewRow
          label="Track"
          primary="Circuit de Monaco · 3.337 km"
          secondary="78 laps · Monte Carlo, Monaco"
        />
        <PreviewRow
          label="Weather"
          primary="Partly cloudy · 22°C"
          secondary="Humidity 45% · Wind 12 km/h SW"
        />
        <PreviewRow
          label="Championship Lead"
          primary="Max Verstappen · Red Bull Racing"
          secondary="312 pts · +67 over Leclerc"
        />
        <PreviewRow
          label="Fastest Lap Record"
          primary={
            <>
              Lewis Hamilton · 1:12
              {/*
               * The MegaStat superscript treatment, borrowed at row scale: `align-super` plus an
               * `em`-relative size, exactly as `mega-stat.tsx` raises its `sup` — no hand-rolled
               * `top` offset, because `vertical-align: super` already resolves against this row's
               * own font size and stays correct if the row is resized. The size is the one number
               * that changes: 0.35em is right against a `.text-mega` numeral and would render at
               * ~5px here, so this row takes 0.55em (~8px against 14px text).
               *
               * Stays `zinc-200` with the rest of the row. The MegaStat version can be red because
               * it is display-scale; f1-red is 4.01:1 on `base`, which fails the 4.5:1 that
               * applies at this size.
               */}
              <sup className="align-super text-[0.55em]">.909</sup>
            </>
          }
          secondary="Set during the 2021 Grand Prix"
        />
      </TicketCard>
    </div>
  );
}

function PreviewRow({
  label,
  primary,
  secondary,
}: {
  label: string;
  /** A node, not a string: the fastest-lap row splits its value around a `<sup>`. */
  primary: React.ReactNode;
  secondary: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="text-sm text-zinc-200">{primary}</p>
      <p className="text-sm text-zinc-500">{secondary}</p>
    </div>
  );
}
