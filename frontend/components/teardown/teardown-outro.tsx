import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { MegaStat } from '@/components/candy/mega-stat';
import { TicketCard } from '@/components/candy/ticket-card';
import { TopoBackground } from '@/components/candy/topo-background';
import { Button } from '@/components/ui/button';

/**
 * 2026-regulation figures, cited verbatim in the task brief and (per that brief) in the parent's
 * commit message — do not round, invent, or add a fifth. `sup` carries the unit exactly as
 * `MegaStat` expects: a raised trailing fragment sitting outside the counted numeral, not part of
 * the counted value itself (a "1000 HP" stat that counted up through "1000HP" as one string would
 * have no stable digit count to reserve width for).
 */
const STATS = [
  { value: 1000, sup: 'HP', label: 'Power unit output' },
  { value: 15000, sup: 'RPM', label: 'Rev limit' },
  { value: 768, sup: 'KG', label: 'Minimum weight' },
  { value: 5, sup: 'G', label: 'Peak cornering' },
] as const;

/**
 * The four 2026-regulation systems, cited verbatim in the task brief and (per that brief) in the
 * parent's commit message — do not reword, extend, or add a fifth. `title` is the card's first
 * line (small display-caps, not `f1-red`: at this size red fails the 4.5:1 small-text floor —
 * see SHARED-P4.md's contrast table), `body` is the descriptive sentence, `footer` the closing
 * strip.
 */
const SYSTEMS = [
  {
    kicker: '01 · Power unit',
    title: 'V6 turbo-hybrid',
    body: 'A 1.6-litre V6 turbo, and from 2026 an electric motor almost its equal — roughly 400 kW of combustion against 350 kW of deployment, running on fully sustainable fuel.',
    footer: '~1000 HP combined',
  },
  {
    kicker: '02 · Aerodynamics',
    title: 'Active wings',
    body: 'Front and rear wings that shed drag down the straight and load up again for the corner. Every surface trades top speed against the grip needed to carry it.',
    footer: 'Active aero',
  },
  {
    kicker: '03 · Chassis',
    title: 'Carbon monocoque',
    body: "A survival cell moulded in carbon fibre with the halo bonded to it. The halo alone is load-tested to around twelve tonnes — roughly a London bus resting on the driver's head.",
    footer: 'Monocoque + halo',
  },
  {
    kicker: '04 · Tyres and brakes',
    title: '18-inch slicks',
    body: 'Three dry compounds plus intermediates and full wets, on 18-inch rims. The carbon brake discs behind them run past 1000°C into a heavy braking zone.',
    footer: 'Carbon discs',
  },
] as const;

/**
 * The closing section of `/teardown`, read with a ~36px docked mini car sitting in the page
 * header above it (per the parent's `teardown-scene.tsx`) — the reason this reads as a stage for
 * that car rather than an unrelated new page. No `'use client'`: nothing here needs a hook.
 * `MegaStat`, `TicketCard` and `Button` all call hooks internally (`useReducedMotion`,
 * `React.forwardRef`/context, etc.) and each covers its own behaviour, so this file can stay a
 * synchronous server component importing client children, the same shape every landing section on
 * this branch already uses.
 *
 * No entrance motion of its own was added. `MegaStat`'s own count-up (once-in-view, respects
 * reduced motion) already gives the four stats an entrance; stacking a second `motion.div` fade
 * around each one would double-animate the same reveal for no visible gain, and `'use client'`
 * only earns its cost here if a hook is actually needed.
 *
 * Extended per the task brief to fix a reported bug: the section originally ended after the
 * closing paragraph and filled only about a quarter of the viewport below the docked car, leaving
 * a large band of empty `bg-zinc-950`. Two blocks were added below the original content (kept
 * verbatim, per the brief): a second heading group over four `TicketCard`s describing the car's
 * systems, then a closing line and a `/briefing` CTA. Both reuse `id="teardown-outro-heading"` as
 * the section's sole `aria-labelledby` target — the new `h3` gets its own `id` for in-page
 * reachability but does not become a second landmark label, since a section has exactly one.
 */
export function TeardownOutro(): React.JSX.Element {
  return (
    <section
      id="teardown-outro"
      aria-labelledby="teardown-outro-heading"
      // `bg-zinc-950`, matching the rest of `/teardown` per SHARED-P4.md — the page does not use
      // the `base` token. `relative overflow-hidden` is for `TopoBackground`: it needs a
      // positioned ancestor to resolve its `inset-0`, and `overflow-hidden` keeps the fixed-pixel
      // tile from spilling past the section's edge on a viewport wider than one tile (900px).
      className="relative overflow-hidden bg-zinc-950 py-24 lg:py-32"
    >
      {/* Texture. `text-ink` is load-bearing, not decorative styling: `TopoBackground` strokes
          `currentColor` and declares no colour of its own, so a bare instance resolves to
          `rgb(0, 0, 0)` — black-on-`zinc-950`, invisible, and indistinguishable from a correct
          instance without sampling the pixel. That is the exact bug SHARED-P4.md records as
          having already shipped once in Phase 3's hero; this is the regression the test file's
          `text-ink` assertion guards against. 0.07 matches the other three full-section instances
          (`landing-hero`, `landing-cta-band`, `landing-footer`) so all four read as one material. */}
      <TopoBackground className="text-ink opacity-[0.07]" />

      {/* `relative` moves this wrapper into the same "positioned, z-index: auto" stacking bucket
          as the texture above. Without it, CSS's stacking rules paint any positioned element
          *after* plain in-flow boxes regardless of source order, so the texture — written first
          in the DOM but `position: absolute` — would paint over this content despite looking
          right in this file. `components/candy/ticket-card.tsx` documents the same trap. */}
      <div className="container relative mx-auto px-4">
        <div className="mb-16 max-w-2xl">
          {/* Kicker, copied verbatim from SHARED-P4.md's idiom. `zinc-500` at `text-[11px]
              font-semibold` is the one shipped exception to "zinc-500 fails small text" — see
              SHARED-P4.md's contrast-floor note; the colour is not "fixed" here. */}
          <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
            By the numbers
          </p>
          {/* Mixed-type heading. Written in sentence case in the markup, matching every other
              instance of this idiom on the branch (e.g. `landing-features.tsx`'s "Everything for
              a complete"): the `uppercase` class does the capitalising, so what's typed here is
              what a screen reader or a copy-paste actually gets, not a shout in the JSX. The
              serif accent span carries `normal-case` for the same reason `LandingFeatures` does —
              the sentence-case contrast against the surrounding caps is the point of the
              treatment, and `uppercase` on the accent run would erase it. */}
          <h2
            id="teardown-outro-heading"
            className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
          >
            The numbers{' '}
            <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
              behind the car
            </span>
            .
          </h2>
        </div>

        {/* Four stats, two columns under `md` and four from it up. `scale="mid"` is
            `clamp(2.5rem, 6vw, 4.5rem)` per `mega-stat.tsx` — at 390px that's a ~40px numeral and
            "768" alone runs roughly 75px wide, so four across the 390px viewport (minus the
            container's `px-4`) does not fit; two does. `md` (768px) rather than `lg` (1024px)
            because the four-across row is comfortably narrow well before `lg` — a tablet-width
            viewport has the room and holding it at two columns that far up would waste it.
            `items-start` needs no extra help here: `MegaStat` is already `inline-flex flex-col
            items-start` with no intrinsic width, so a bare grid cell is enough to seat it at the
            cell's start edge without a wrapping div fighting that alignment. */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 md:gap-x-12">
          {STATS.map((stat) => (
            <MegaStat
              key={stat.label}
              value={stat.value}
              sup={stat.sup}
              label={stat.label}
              scale="mid"
            />
          ))}
        </div>

        {/* Closing line. `max-w-[65ch]` per the brief; `ch` ties the cap to the glyph width of
            the font actually in use rather than a fixed pixel guess. */}
        <p className="mt-16 max-w-[65ch] text-zinc-400">
          Every one of those numbers is a compromise with the other three. That is the whole sport.
        </p>

        {/* Block 1: "the systems". `mt-20 lg:mt-28` per the brief's vertical-rhythm note — this is
            a new visual beat, not a continuation of the stats above, so it wants clearly more
            separation than the `mt-16` between the heading and the stats. */}
        <div className="mt-20 lg:mt-28">
          <div className="mb-16 max-w-2xl">
            <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
              Under the bodywork
            </p>
            {/* `h3`, not `h2`: the section already has one `h2` and the section's own
                `aria-labelledby` points at it (see the docstring above). This heading gets its own
                `id` purely so it is independently reachable — the section is not re-labelled by
                it. Same mixed-type idiom as the `h2` above: sentence case typed in the markup,
                `uppercase` doing the shouting, the serif accent carrying `normal-case` so its
                sentence-case reads against the surrounding caps. */}
            <h3
              id="teardown-outro-systems-heading"
              className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
            >
              Four systems,{' '}
              <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
                one compromise
              </span>
              .
            </h3>
          </div>

          {/* One column at base, two from `sm`, four from `lg` per the brief. `items-stretch`
              (grid's default) plus `h-full` on each card is what keeps all four notched corners
              on one baseline — without `h-full` a shorter body would leave that card's card
              shorter than its neighbours and the row of ticket stubs would read as ragged rather
              than a matched set. */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SYSTEMS.map((system) => (
              <TicketCard
                key={system.kicker}
                kicker={system.kicker}
                footer={
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    {system.footer}
                  </span>
                }
                className="h-full"
              >
                {/* `TicketCard`'s main content slot carries no padding, so `px-4 py-3` here
                    matches the value `/candy`'s styleguide uses for the same slot. Title stays
                    `text-ink`, not `f1-red`: at this display size (well under 24px) red fails the
                    4.5:1 small-text contrast floor SHARED-P4.md measures. */}
                <div className="px-4 py-3">
                  <p className="font-display text-sm uppercase tracking-tight text-ink">
                    {system.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{system.body}</p>
                </div>
              </TicketCard>
            ))}
          </div>
        </div>

        {/* Block 2: closing line + CTA. Same `mt-20 lg:mt-28` beat as block 1, separating this
            band from the cards above it. */}
        <div className="mt-20 lg:mt-28">
          <p className="text-sm text-zinc-400">That is the car. The race is the other half.</p>
          {/* Red pill, copied verbatim from SHARED-P3.md §3 ("Buttons — the red pill and the dark
              pill") via SHARED-P4.md's pointer to it — same classes, same `hover:bg-[#B80500]`
              (not `hover:bg-red-700`, a different hue that would read as a colour change rather
              than a darkening) as the hero and CTA band use. The `mt-6` spacing lives on a
              wrapping `div`, not folded into the `Button`'s own `className`, so that string stays
              an exact, diffable copy of the brief's markup. */}
          <div className="mt-6">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-f1-red px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#B80500] focus-visible:ring-f1-red"
            >
              <Link href="/briefing">
                Generate a Briefing
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
