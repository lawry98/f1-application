import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import { MegaStat } from '@/components/candy/mega-stat';
import { TicketCard } from '@/components/candy/ticket-card';
import { TopoBackground } from '@/components/candy/topo-background';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusRingOnRedFill } from '@/lib/focus';

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
 * line (small display-caps, not `f1-red`: `f1-red` measures 4.01:1 on this dark page, which
 * clears WCAG's 3:1 large-text bar but fails the 4.5:1 small-text one, so red *text* is only
 * allowed at ~24px+ regular or ~19px+ bold — red as a fill, bar or stroke is unconstrained),
 * `body` is the descriptive sentence, `footer` the closing strip.
 */
/**
 * The four road-car comparison figures, cited verbatim in the task brief and (per that brief) in
 * the parent's commit message — do not recompute, round, or add a fifth. The downforce row is the
 * conservative end of a 1000–1600 kg range that varies with setup and regulation era; it is low on
 * purpose, per the brief, not an oversight (the same figure and the same caveat this branch's
 * `f1_data_tools.py`/`CLAUDE.md` register applies to backend numbers — cite the source, don't
 * "improve" it). `f1Unit` is the raised fragment rendered in a `<sup>` beside `f1Value`, mirroring
 * `sup` on `MegaStat` — but this table is static (no count-up), so there's no `MegaStat` instance
 * to actually reuse, just its visual idiom. `roadValue` is a full string that already carries its
 * own unit (e.g. `'3.5 s'`) rather than a separate value/unit pair: the road-car column is
 * deliberately the quieter foil, not a second loud numeral that needs the same split treatment.
 */
const COMPARISON_ROWS = [
  { label: '0–100 km/h', f1Value: '2.6', f1Unit: 'S', roadValue: '3.5 s' },
  { label: '100–0 km/h braking', f1Value: '15', f1Unit: 'M', roadValue: '32 m' },
  { label: 'Downforce at 250 km/h', f1Value: '1000', f1Unit: 'KG', roadValue: 'near zero' },
  { label: 'Power to weight', f1Value: '1300', f1Unit: 'HP/T', roadValue: '450 hp/t' },
] as const;

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
 * that car rather than an unrelated new page. This file declares no `'use client'` of its own,
 * because nothing in it needs a hook — `MegaStat`, `TicketCard` and `Button` each call their own
 * hooks and each covers its own behaviour. That is a statement about this file's directives, not
 * about where it renders: its only importer, `teardown-scene.tsx`, *is* `'use client'`, so this
 * component compiles into the client bundle regardless. Do not budget bundle size on the absence
 * of the directive.
 *
 * No entrance motion of its own was added. `MegaStat`'s own count-up (once-in-view, respects
 * reduced motion) already gives the four stats an entrance; stacking a second `motion.div` fade
 * around each one would double-animate the same reveal for no visible gain, and `'use client'`
 * only earns its cost here if a hook is actually needed.
 *
 * Extended per the task brief to fix a reported bug: the section originally ended after the
 * closing paragraph and filled only about a quarter of the viewport below the docked car, leaving
 * a large band of empty `bg-zinc-950`. Three blocks were added below the original content (kept
 * verbatim, per the brief): a second heading group over four `TicketCard`s describing the car's
 * systems, a road-car comparison table added in a later pass ("the scale" block — see its own
 * comment below for why it's a `<table>`), then a closing line and a `/briefing` CTA with no
 * heading of its own. The two new `h3`s (systems, scale) each get their own `id` for in-page
 * reachability, but both keep pointing the section's sole `aria-labelledby` at the original
 * `id="teardown-outro-heading"` `h2` — a section has exactly one accessible name, and neither new
 * heading becomes a second landmark label.
 */
function TeardownOutroSection(): React.JSX.Element {
  return (
    <section
      id="teardown-outro"
      aria-labelledby="teardown-outro-heading"
      // `bg-zinc-950`, matching the rest of `/teardown` — the page spells the colour out rather
      // than using the `base` token, which resolves to the same `#09090B` (see
      // `tailwind.config.ts` and `lib/team-utils.ts`'s `DARK_BG`), so contrast measured against
      // either is the same number. `relative overflow-hidden` is for `TopoBackground`: it needs a
      // positioned ancestor to resolve its `inset-0`, and `overflow-hidden` keeps the fixed-pixel
      // tile from spilling past the section's edge on a viewport wider than one tile (900px).
      className="relative overflow-hidden bg-zinc-950 py-24 lg:py-32"
    >
      {/* Texture. `text-ink` is load-bearing, not decorative styling: `TopoBackground` strokes
          `currentColor` and declares no colour of its own, so a bare instance resolves to
          `rgb(0, 0, 0)` — black-on-`zinc-950`, invisible, and indistinguishable from a correct
          instance without sampling the pixel. That exact bug already shipped once on this branch
          (the Phase 3 hero); this is the regression the test file's `text-ink` assertion guards
          against. 0.07 matches the other three full-section instances
          (`landing-hero`, `landing-cta-band`, `landing-footer`) so all four read as one material. */}
      <TopoBackground className="text-ink opacity-[0.07]" />

      {/* `relative` moves this wrapper into the same "positioned, z-index: auto" stacking bucket
          as the texture above. Without it, CSS's stacking rules paint any positioned element
          *after* plain in-flow boxes regardless of source order, so the texture — written first
          in the DOM but `position: absolute` — would paint over this content despite looking
          right in this file. `components/candy/ticket-card.tsx` documents the same trap. */}
      <div className="container relative mx-auto px-4">
        <div className="mb-16 max-w-2xl">
          {/* Section-kicker idiom, shared with the two `h3` blocks below and with the landing
              sections: `mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase
              tracking-[0.2em]` plus a `h-1.5 w-5 flex-shrink-0 bg-f1-red` tick.

              `zinc-400`, not the `zinc-500` this originally shipped with. `zinc-500` (`#71717a`)
              measures 4.12:1 on `zinc-950` and 3.93:1 once a `TicketCard`'s `bg-white/[0.03]`
              lightens the backdrop; the floor is 4.5:1. WCAG's large-text exemption does not
              apply — it starts at 18.66px bold / 24px regular, so an 11px small-caps label and a
              14px table cell are both squarely small text. `zinc-400` (`#a1a1aa`) is 7.76:1 on
              the page and 7.42:1 on the card. `tests/teardown-outro.test.tsx` asserts both
              numbers with `contrastRatio` rather than restating them in a comment, because a
              commented measurement is exactly how the `zinc-500` regression survived a review. */}
          <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
            {/* Same kicker idiom and the same `zinc-400` as "By the numbers" above — see that
                comment for the contrast measurements behind the colour. */}
            <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
                  // `zinc-400`, not `zinc-500`: this label sits *inside* the card, on
                  // `TicketCard`'s `bg-white/[0.03]` composite (`#101012`), where `zinc-500`
                  // drops to 3.93:1 — lower than the 4.12:1 it already fails at on the bare
                  // page. Judged against the card surface, not `DARK_BG`; see
                  // `cardSurfaceBackdrop` in `lib/team-utils.ts`.
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                    {system.footer}
                  </span>
                }
                className="h-full"
              >
                {/* `TicketCard`'s main content slot carries no padding, so `px-4 py-3` here
                    matches the value `/candy`'s styleguide uses for the same slot. Title stays
                    `text-ink`, not `f1-red`: at this display size (well under the ~24px regular /
                    ~19px bold that WCAG treats as large text) `f1-red`'s 4.01:1 fails the 4.5:1
                    small-text floor. `ink` is 17.21:1 on the card surface. */}
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

        {/* "The scale" block — a road-car comparison, inserted here deliberately: the task brief
            calls this the *third* block of the outro, sitting between the four systems
            `TicketCard`s above and the closing line + CTA below, not appended after them. The
            "Block 1"/"Block 2" labels on the comments above and below are left as written rather
            than renumbered to "Block 1/2/3" — the brief says not to disturb those two blocks, and
            a comment-only renumbering still touches content it named as off-limits. Same
            `mt-20 lg:mt-28` beat as the systems block above: a new visual beat, not a continuation
            of what's above it. */}
        <div className="mt-20 lg:mt-28">
          <div className="mb-16 max-w-2xl">
            {/* Third instance of the same kicker idiom, same `zinc-400` — see the "By the
                numbers" kicker above for the contrast measurements. */}
            <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
              For scale
            </p>
            {/* `h3`, same reasoning as the systems block's `h3` above: the section's one
                `aria-labelledby` stays on the original `h2` (see the file's top docstring); this
                heading just needs its own `id` to be independently reachable. Sentence case typed
                in the markup, `uppercase` doing the shouting, same mixed-type idiom as every other
                heading on this branch. */}
            <h3
              id="teardown-outro-scale-heading"
              className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
            >
              The same job,{' '}
              <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
                a different animal
              </span>
              .
            </h3>
          </div>

          {/* A real <table>, not a <div> grid: this is genuinely tabular data — two named columns
              (Formula 1, a road car) compared row-by-row across four fixed measures — and a
              <table> gives that structure to assistive tech for free (`scope="col"`/`scope="row"`,
              a screen reader's table-navigation commands) instead of reconstructing the same
              relationships from ARIA on a grid of `<div>`s. The tradeoff is responsiveness, which
              is why `table-fixed` plus explicit column widths is used instead of the default
              `auto` table layout: `auto` sizes each column from its widest cell and can grow the
              table wider than its container on a long value, `fixed` cannot — that is what keeps
              three columns from forcing horizontal overflow at a 390px viewport (label column at
              40%, each value column at 30%, comfortably inside a ~358px content width after the
              container's `px-4`) without reaching for a horizontal scroll container, which the
              brief asks not to invent. */}
          <table className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">
              Formula 1 car compared with a fast road car across four performance measures
            </caption>
            <thead>
              <tr className="border-b border-white/[0.07]">
                {/* Corner cell: neither of the brief's two named columns is "row label", so this
                    cell has no visible heading — but a <th> with literally no text content still
                    has no accessible name, which some screen readers announce as a bare "blank" on
                    every row. The sr-only span gives it one without adding visible copy the brief
                    never asked for. */}
                <th scope="col" className="w-[40%] pb-3">
                  <span className="sr-only">Measure</span>
                </th>
                <th
                  scope="col"
                  className="w-[30%] pb-3 pr-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
                >
                  Formula 1
                </th>
                <th
                  scope="col"
                  className="w-[30%] pb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
                >
                  Road car
                </th>
              </tr>
            </thead>
            {/* `divide-y` on the body rows, a `border-b` on the header row above — two different
                mechanisms for the same hairline, because `divide-y` only ever paints *between*
                its own children and would draw nothing above the first body row. */}
            <tbody className="divide-y divide-white/[0.07]">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  {/* `scope="row"`, not a <td>: this cell names what the row is about (the
                      measure), the same relationship `scope="col"` gives the two value columns
                      above — a screen reader can announce "0–100 km/h, Formula 1, 2.6 S" from
                      either header, which a bare <td> label would not offer. */}
                  <th scope="row" className="py-4 pr-3 text-sm font-normal text-zinc-400">
                    {row.label}
                  </th>
                  <td className="py-4 pr-3 font-display text-2xl text-ink lg:text-3xl">
                    {row.f1Value}
                    {/* Raised unit at `text-[0.5em]` per the brief — the same superscript idiom
                        `MegaStat` uses (a sibling `<sup>` sharing the numeral's own font-size
                        rather than the page default), just at the brief's own size rather than
                        `mega-stat.tsx`'s `0.35em`: this is a static table value, not a counted
                        `MegaStat`, so there's no shared component whose exact figure to inherit. */}
                    <sup className="align-super text-[0.5em]">{row.f1Unit}</sup>
                  </td>
                  {/* Deliberately quieter than the F1 column per the brief: smaller (`text-sm`
                      against the F1 column's `text-2xl`/`text-3xl`) and a neutral rather than
                      `text-ink` — the road car is the foil here, not the subject. The quiet
                      neutral is `zinc-400`, not `zinc-500`: `text-sm` is 14px, and WCAG's
                      large-text exemption only begins at 18.66px bold / 24px regular, so this
                      cell is small text and `zinc-500`'s 4.12:1 on `zinc-950` fails the 4.5:1
                      floor exactly as the 11px labels do. Size buys nothing here. Never
                      `f1-red` either: at 4.01:1 that colour needs ~24px regular / ~19px bold to
                      be legal as text, and every value in this table is under it. */}
                  <td className="py-4 text-sm text-zinc-400">{row.roadValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Block 2: closing line + CTA. Same `mt-20 lg:mt-28` beat as block 1, separating this
            band from the cards above it. */}
        <div className="mt-20 lg:mt-28">
          <p className="text-sm text-zinc-400">That is the car. The race is the other half.</p>
          {/* The shared "red pill": the same classes the landing hero and CTA band use, including
              `hover:bg-[#B80500]` (not `hover:bg-red-700`, a different hue that would read as a
              colour change rather than a darkening). The `mt-6` spacing lives on a wrapping
              `div`, not folded into the `Button`'s own `className`, so that string stays an
              exact, diffable copy of the shared pill's markup.

              The focus ring is `focusRingOnRedFill` from `lib/focus.ts` — the branch's ring rule
              and its measurements now live there. The offset is `base` because this section's
              `bg-zinc-950` is that same `#09090B`. */}
          <div className="mt-6">
            <Button
              asChild
              size="lg"
              className={cn(
                'rounded-full bg-f1-red px-7 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#B80500]',
                focusRingOnRedFill,
                'focus-visible:ring-offset-base',
              )}
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

/**
 * Memoised, and the memo is load-bearing despite this component taking no props — do not delete
 * it as a no-op. `teardown-scene.tsx` renders this section inside a tree that calls `setState`
 * on a scroll-driven value, so it re-renders on scroll. Without `memo`, every one of those
 * renders reconciles this whole subtree: four `MegaStat`s (each with its own `useInView` and
 * spring), four `TicketCard`s, five `TopoBackground`s at twelve `<path>`s apiece, and the
 * comparison table. Taking no props is exactly what makes the memo unconditional — there is no
 * prop that can ever invalidate it, so the subtree is reconciled once.
 */
export const TeardownOutro = memo(TeardownOutroSection);
