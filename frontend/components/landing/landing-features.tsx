import { Zap, Eye, Database, TrendingUp, Cloud, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';

const FEATURES = [
  {
    icon: Zap,
    title: 'Live Streaming Briefing',
    description:
      'Watch the briefing generate word-by-word via server-sent events. No waiting for a full response — intelligence streams to you the moment it is ready.',
  },
  {
    icon: Eye,
    title: 'Tool Trace Transparency',
    description:
      'See exactly which tools the AI agent executed, in what order, and whether each succeeded. No black box — full visibility into every data-gathering step.',
  },
  {
    icon: Database,
    title: 'Historical F1 Telemetry',
    description:
      'Powered by FastF1: lap times, race results, track profiles, qualifying data, and circuit records going back decades — all available without an API key.',
  },
  {
    icon: TrendingUp,
    title: 'Driver & Team Form',
    description:
      'Current championship standings, recent race pace, and head-to-head driver context synthesised into every briefing. Know who is peaking before qualifying.',
  },
  {
    icon: Cloud,
    title: 'Race Weather Forecast',
    description:
      'OpenWeather integration pulls the race-weekend forecast for the correct circuit location — temperature, humidity, wind, and conditions that could shape strategy.',
  },
  {
    icon: Layers,
    title: 'Interactive Car Anatomy',
    description:
      'Scroll through 192 high-res animation frames to reveal what is hidden inside a 2024 F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
  },
] as const;

/**
 * The one red mark this page repeats: a 6×20px solid `f1-red` bar.
 *
 * It is the same geometry as `MegaStat`'s tick (`h-1.5 w-5 bg-f1-red`) and the same geometry as the
 * section kicker Phase 3 standardised on, and that repetition is the whole point — the kicker, the
 * stats on /teams and these six icon chips must read as one recurring mark rather than three
 * near-misses. `flex-shrink-0` because it sits in a flex row next to content that can wrap: without
 * it a long title squeezes the bar to a sliver at narrow widths, which is exactly how a deliberate
 * mark starts looking like an accident.
 */
const TICK = 'h-1.5 w-5 flex-shrink-0 bg-f1-red';

export function LandingFeatures() {
  return (
    // No `bg-*`: `app/page.tsx` wraps every landing section in a `LandingSectionTheme` that owns
    // the surface colour, and a background here would paint over it. This section's tone is `base`.
    // The `border-t` stays — it separates this grid from the marquee band above, which is warm.
    <section
      id="features"
      className="border-t border-white/10 py-24"
      aria-labelledby="features-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        {/* Section header */}
        <BlurFadeReduced inView delay={0} direction="up">
          <div className="mb-16 max-w-2xl">
            {/* Was `text-sm ... text-f1-red`. `f1-red` measures 4.01:1 on `base`, which clears
                WCAG's 3:1 large-text bar but not the 4.5:1 small-text one — so a 14px red kicker
                was a real contrast failure. The colour moves into the bar, where it is a
                decorative fill and unconstrained, and the words go grey. */}
            <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              <span className={TICK} aria-hidden="true" />
              What you get
            </p>
            {/* Mixed type: ALL-CAPS display in `ink`, with exactly one accent run swapped to the
                serif italic in red. The case is set in the markup — `uppercase` on the h2,
                `normal-case` on the span — because the serif accent staying sentence-case against
                the caps is the contrast the treatment exists for. Red is legal here only because
                the type is 36px+; it would not be at the card-title size below. */}
            <h2
              id="features-heading"
              className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
            >
              Everything for a complete{' '}
              <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
                race weekend
              </span>{' '}
              picture.
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              One query. Multiple sources. One authoritative briefing.
            </p>
          </div>
        </BlurFadeReduced>

        {/* Feature grid.
            A `ul`/`li` rather than nested divs: six sibling items of the same kind are a list, and
            saying so gives assistive tech the item count for free. The `li` is the grid item, so
            the equal-height chain is `li h-full` → `BlurFadeReduced h-full` → `Card h-full`; drop any
            link in it and cards in a short row stop matching their neighbours' height. */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <li key={title} className="h-full">
              {/* 0.06 s per index is the spec's 60 ms stagger. Deliberately still the BlurFade
                  mechanism and not a hand-rolled `motion` stagger: it already fires once on view
                  with the right direction, and replacing a working mechanism to change one number
                  is how a restyle turns into a rewrite. `BlurFadeReduced` is that same mechanism
                  with a reduced-motion branch — under the preference all six cards are complete
                  and unblurred on arrival rather than staggering in. */}
              <BlurFadeReduced inView delay={0.06 * i} direction="up" className="h-full">
                <Card className="group h-full border-white/10 bg-white/[0.03] transition-[border-color,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-white/25">
                  <CardHeader className="space-y-4">
                    {/* The red tick icon chip: the page's tick mark, then the icon tile. Same
                        bar-then-content order and same `gap-2.5` as the kicker above, so the two
                        read as one idiom seen twice rather than two decorations. The lucide icon
                        stays — all six are meaningful — and stays red, because an icon is a fill,
                        not text, so the 4.5:1 small-text floor does not apply to it. */}
                    <div className="flex items-center gap-2.5">
                      <span className={TICK} aria-hidden="true" />
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] transition-colors group-hover:border-white/20 group-hover:bg-white/[0.06]">
                        <Icon className="h-5 w-5 text-f1-red" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="space-y-2">
                      {/* `text-[15px]`, not a bare `text-base`, purely to hold the size it already
                          had while the display face runs a touch wider in caps. `leading-tight`
                          because CardTitle ships `leading-none`, which collides with the two-line
                          titles ("Interactive Car Anatomy") once they are uppercased. */}
                      <CardTitle className="font-display text-[15px] uppercase leading-tight tracking-tight text-ink">
                        {title}
                      </CardTitle>
                      {/* Sans, sentence case, zinc-400. Uppercasing the descriptions was never on
                          the table — the caps treatment is for display type only, and 40 words of
                          it is unreadable. */}
                      <CardDescription className="text-sm leading-relaxed text-zinc-400">
                        {description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </BlurFadeReduced>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
