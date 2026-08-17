'use client';

import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Expand } from 'lucide-react';

import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import { TopoBackground } from '@/components/candy/topo-background';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusRingOffsetBase } from '@/lib/focus';
import {
  teamColorButtonStyle,
  seamWash,
  seamLabelColor,
  sectionGradient,
  sectionStandingColor,
  GLOW_PEAK_OPACITY,
} from '@/lib/team-utils';
import { STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { DriverPortrait } from './driver-portrait';
import { TeamMonogramTile, monogram } from './team-monogram-tile';

interface TeamSectionProps {
  team: Team;
  index: number;
  isActive: boolean;
  onInspect: () => void;
  reducedMotion: boolean;
}

export function TeamSection({ team, index, isActive, onInspect, reducedMotion }: TeamSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isContentInView = useInView(contentRef, { once: true, margin: '-80px 0px' });

  const blobOnRight = index % 2 === 0;
  const ctaStyle = teamColorButtonStyle(team);

  return (
    <section
      id={`team-${team.id}`}
      className="relative scroll-mt-[var(--teams-scroll-offset)] overflow-hidden bg-zinc-950"
    >
      {/*
        The section's two bottom-most decorative layers, in this order and ahead of everything
        else in the DOM because that order *is* their stacking order: the seam, the glow blob and
        the content grid are all either positioned or `z-10`, so a later sibling paints on top.

        The gradient is the livery at `SECTION_GRADIENT_PEAK_ALPHA` ramping away across the
        section's upper half, and it is the layer with a contrast cost — it stacks *under* the
        glow, so the worst opaque colour behind a line of copy in here is the livery composited
        twice (`sectionSurfaceBackdrop`). That is what forces this file's neutral floor up a rung;
        see the `zinc-300` comment on the kicker below.

        `sectionGradient` writes `rgba()` rather than an `#RRGGBBAA` suffix on purpose — jsdom's
        CSS parser drops the eight-digit hex form inside a gradient, which would make this
        declaration unobservable from a test.

        `TopoBackground` strokes `currentColor` and declares no colour of its own, so a bare
        `<TopoBackground />` here would resolve to `rgb(0, 0, 0)` on a near-black page: an
        invisible texture that is indistinguishable from a tasteful one in a screenshot, because
        there is nothing wrong to see. `text-ink` is not styling, it is what makes it exist.
        `opacity-[0.04]` is the spec's 4% and overrides the component's own 12% default through
        tailwind-merge.
      */}
      <div
        aria-hidden="true"
        data-testid="team-gradient"
        className="pointer-events-none absolute inset-0"
        style={{ background: sectionGradient(team.color) }}
      />
      <TopoBackground className="text-ink opacity-[0.04]" />

      {/*
        The seam. This used to be a 1px rule in *this* team's colour at this section's top
        edge — which put it directly beneath the previous team's content, where it read as
        that team's bottom border rather than this team's opening. A downward wash carrying
        the incoming constructor's own name cannot be mistaken for the end of something.
      */}
      <div
        data-testid="team-seam"
        className="relative h-16 w-full"
        style={{
          background: `linear-gradient(to bottom, ${seamWash(team.color)}, transparent)`,
        }}
      >
        {/*
          `seamLabelColor`, not `readableOnDark`. This label is the one piece of team-coloured
          text on the page that does *not* sit on bare `zinc-950` — it sits on the wash two
          lines up. Judged against that composite, `readableOnDark` leaves seven of the eleven
          liveries short of AA. See `seamLabelColor`.
        */}
        <p
          data-testid="team-seam-label"
          className="absolute left-6 top-5 text-[10px] uppercase tracking-[0.24em] lg:left-12"
          style={{ color: seamLabelColor(team.color) }}
        >
          {team.name}
        </p>
      </div>

      {/* Ambient glow blob — alternates position for visual variety. The only animated
          property is `opacity`, so that is what `will-change` hints: hinting `transform`
          promoted eleven 40vw×40vw layers permanently and bought nothing.

          It peaks at `GLOW_PEAK_OPACITY`, not at 1. A 40vw blob with a 120px blur is wider than
          the margin of an 840px section, so its core lands on the content column — and at full
          strength nothing written there clears AA, white included. The livery hex is untouched;
          see `GLOW_PEAK_OPACITY`. */}
      <motion.div
        className="pointer-events-none absolute will-change-[opacity]"
        style={{
          width: '40vw',
          height: '40vw',
          borderRadius: '50%',
          backgroundColor: team.color,
          filter: 'blur(120px)',
          top: '10%',
          ...(blobOnRight ? { right: '-20%' } : { left: '-20%' }),
        }}
        animate={{ opacity: isActive ? GLOW_PEAK_OPACITY : 0 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
        initial={{ opacity: 0 }}
      />

      {/* Oversized monogram bleeding off the leading edge. Decorative only. */}
      <span
        data-testid="team-watermark"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-8 select-none text-[14rem] font-black leading-none text-ink opacity-[0.035]',
          blobOnRight ? '-left-10' : '-right-10',
        )}
      >
        {monogram(team.shortName)}
      </span>

      {/* Content — a full-width heading row, then the two-column grid beneath it.
       *
       * **The heading used to sit inside the left column, and moving it out is a layout fix, not
       * a preference.** A mega team name does not fit a column: measured in Chromium at 1440x1000
       * with the rail and dossier mounted, a section is 840px, so the grid has 744px of content
       * and the drivers column wants 380px of it — leaving 316px. `MERCEDES` at this heading's
       * 80px renders 473px wide, and since it is one unbreakable word its min-content width is
       * that whole 473px. The flex line then over-subscribes and both columns shrink: measured
       * across all eleven, the drivers column fell to **203px for Mercedes** (95px-wide portrait
       * cards, cropped to the top of a helmet), 253–255px for McLaren, Williams and Cadillac, and
       * only Red Bull, Haas and Audi kept their intended 380px. Seven of eleven were wrong.
       *
       * `min-w-0` does not fix it — that permits shrinking *below* min-content, which here means
       * the heading overflowing under the driver cards instead of squeezing them. Shrinking the
       * clamp until `MERCEDES` fits 316px puts it at ~53px, i.e. *smaller* than the 60px this
       * heading was before Phase 5, which is not a mega treatment by any reading.
       *
       * Given its own row the heading has the full 744px and every team keeps its 380px of
       * drivers. `lg:flex-shrink-0` on that column below is the guard that makes the failure
       * impossible rather than merely unlikely. */}
      <div
        ref={contentRef}
        className="relative z-10 flex flex-col gap-8 px-6 py-20 lg:gap-10 lg:px-12"
      >
        {/* Vertical accent bar + team name */}
        <div className="flex items-start gap-4">
          <motion.div
            className="mt-1 flex-shrink-0 rounded-full"
            initial={{ scaleY: 0, height: 0 }}
            animate={
              isContentInView
                ? { scaleY: 1, height: reducedMotion ? 40 : 48 }
                : { scaleY: 0, height: 0 }
            }
            transition={
              reducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut', delay: 0.1 }
            }
            style={{ width: 4, backgroundColor: team.color, transformOrigin: 'top' }}
          />

          {/* `text-ink` lives *here*, on the wrapper, and the heading inherits it. Two separate
                reasons, and both have already cost this heading a defect:

                1. `RedactedReveal` runs the `className` below through `cn()`. tailwind-merge reads
                   an arbitrary `text-[…]` whose value is not a plain length — `clamp()` is not —
                   as a *colour* utility, so a size and `text-ink` in the same string collapse to
                   whichever came last and the heading silently loses one of them. Keeping the two
                   on different elements means there is nothing to merge.
                2. The rule this replaces: there used to be a `style={{ color: 'white' }}` on the
                   old `TextAnimate` heading, which spread its rest props onto the motion element
                   *after* `className`, so the inline colour beat `text-ink` outright. This heading
                   went on painting #FFFFFF through the whole text-white → text-ink sweep while
                   every other heading on the site moved to #F4F4ED, and nothing in the diff showed
                   it. Inheritance cannot reproduce that: there is no colour on the h2 at all. */}
          <div className="min-w-0 flex-1 text-ink">
            {/* The kicker keeps its mono-caps treatment verbatim — the spec holds this one still
                  rather than moving it to the branch's red-tick kicker idiom. The only thing that
                  moved is the rung.

                  `zinc-300`, not the `zinc-400` that is the floor everywhere else on this branch,
                  and every neutral in this file follows. The section now paints a livery gradient
                  *under* the glow blob, so the worst opaque colour behind this copy is the livery
                  composited twice: on Haas's `#ffffff` that is `#4a4a4b`, where `zinc-400` measures
                  3.45:1 against a 4.5:1 floor and `zinc-300` measures 5.99:1. Worth noting this is
                  not the gradient introducing a new problem so much as spending the last of an
                  existing one — `zinc-400` was already at 4.78:1 on the glow alone, i.e. 0.28 of
                  headroom. `sectionSurfaceBackdrop` is the helper that computes the composite and
                  `team-section.test.tsx` asserts it for all eleven liveries. */}
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-300">Constructor</p>
            {/* The mega *treatment* at a column-scoped size, which is deliberately not
                  `.text-mega`. `.text-mega` is `clamp(4rem, 14vw, 12rem)` measured against the
                  **viewport**, and `/teams` is a three-column page: measured in Chromium at
                  1440x1000 with the rail and dossier mounted, a team section is 840px and the
                  heading's own row 744px, of which the red rule and its gap take 20px — so the
                  heading has **724px**. At `.text-mega`'s 192px cap `MERCEDES` is ≈1136px and the
                  section's own `overflow-hidden` clips it. `leading-[0.85]` and
                  `tracking-[-0.035em]` are `.text-mega`'s own metrics, copied verbatim so the
                  treatment still matches the rest of the branch — this is the part someone
                  "tidies" back into `text-mega` and clips the widest four teams.

                  **The cap is set by `ASTON MARTIN`, not by `MERCEDES`.** Every candidate size was
                  measured in Chromium against all eleven names rather than reasoned about, because
                  the binding constraint is not the longest word but the widest rendered string:

                  | size | widest (`ASTON MARTIN`) | headroom in 724px | wraps |
                  |------|------|------|------|
                  | 80px | 645px | 79px | — |
                  | **84px** | **677px** | **47px** | **—** |
                  | 88px | 709px | 15px | — |
                  | 92px | 724px | 0 | `ASTON MARTIN` |
                  | 96px | 724px | 0 | + `RACING BULLS` |

                  84px is the last size with real margin. 88px fits but leaves 2% of the column,
                  which is not enough to survive a font-metric difference or a future longer name;
                  92px is where a name goes to two lines, and a two-line heading changes the
                  section's height, which is what `hooks/use-scroll-spy.ts` measures — so growing
                  past 84px is a scroll-spy change, not a type change. The cap therefore moves
                  `5rem` → `5.25rem` and nothing else does: below a ~1400px viewport the `6vw` term
                  still governs and the floor is still 40px at 390.

                  `RedactedReveal` renders one `inline-block` element per child and no outer
                  wrapper, so a single child produces exactly one `<h2>`. That is the h2 the page's
                  heading order needs; there is deliberately no second one around it. */}
            <RedactedReveal
              variant="ink"
              as="h2"
              delay={reducedMotion ? 0 : 0.1}
              className="font-display text-[clamp(2.5rem,6vw,5.25rem)] font-black uppercase leading-[0.85] tracking-[-0.035em]"
            >
              {team.shortName}
            </RedactedReveal>
          </div>
        </div>

        {/* The two columns: info left, drivers right. */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
          <div className="flex flex-col gap-6 lg:min-w-0 lg:flex-1">
            {/* The dossier is gone below `xl`, so without this the championship standing
              simply is not on the page at laptop width and below.

              `sectionStandingColor`, not `readableOnDark`: this line renders *inside* the glow
              blob above, not on bare `zinc-950`, and judged against that composite the plain
              livery leaves eight of the eleven teams short of AA. Same mistake the seam label
              made, third call site. */}
            <p
              data-testid="section-standing"
              className="font-mono text-xs tracking-wide"
              style={{ color: sectionStandingColor(team.color) }}
            >
              {`P${team.position} · ${team.points} PTS · ${STANDINGS_AS_OF.toUpperCase()}`}
            </p>

            {/* Tagline */}
            <BlurFadeReduced delay={reducedMotion ? 0 : 0.15} inView>
              <p className="max-w-sm text-base leading-relaxed text-zinc-300">{team.tagline}</p>
            </BlurFadeReduced>

            {/* Meta info */}
            <BlurFadeReduced delay={reducedMotion ? 0 : 0.2} inView>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Base</p>
                  <p className="mt-1 text-sm text-zinc-200">{team.base}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Power Unit</p>
                  <p className="mt-1 text-sm text-zinc-200">{team.powerUnit}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">First Entry</p>
                  <p className="mt-1 text-sm text-zinc-200">{team.firstEntry}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Championships</p>
                  <p className="mt-1 text-sm text-zinc-200">
                    {team.championships > 0 ? (
                      <>
                        <NumberTicker
                          value={team.championships}
                          className="text-sm text-zinc-200"
                        />
                        {' WCC'}
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </div>
            </BlurFadeReduced>

            {/* Mobile/laptop-only inspect button — visible when sticky car viewer is hidden */}
            <BlurFadeReduced delay={reducedMotion ? 0 : 0.25} inView className="xl:hidden">
              {/* Same call as the dossier's copy of this button: it is filled with the livery (or
                  with `#27272a` where `needsDamping` steps a bright one down), and a flush ring
                  would take its contrast from that fill — measured 1.42:1 for red on Alpine's
                  `#008bf6`. The offset colour is safe despite this being a topo section: sampled
                  either side of this control the backdrop reads `#09090b` (Ferrari) and `#090f17`
                  (Alpine, the strongest glow on the grid), so the `base` band composites to
                  within ~1.02:1 of what is actually behind it rather than painting the halo
                  `lib/focus.ts` rule 3 warns about. */}
              <Button
                onClick={onInspect}
                className={cn('gap-2 font-medium', focusRingOffsetBase, ctaStyle.className)}
                style={ctaStyle.style}
              >
                <Expand className="h-4 w-4" />
                Inspect in 3D
              </Button>
            </BlurFadeReduced>
          </div>

          {/* Right: driver portraits.
            `lg:flex-shrink-0` is the guard, not decoration: without it a flex line that
            over-subscribes takes the width out of *this* column, and the portraits are the one
            thing here that degrades into nonsense when narrowed — at 203px the two cards were
            95px wide and cropped to the top of a helmet. The heading moving to its own row is
            what removed today's over-subscription; this is what stops the next one. */}
          <div className="flex flex-col gap-4 lg:w-[340px] lg:flex-shrink-0 xl:w-[380px]">
            <div className="flex gap-3">
              {team.drivers.map((driver, i) => (
                <BlurFadeReduced
                  key={driver.id}
                  delay={reducedMotion ? 0 : 0.1 * i}
                  inView
                  className="min-w-0 flex-1"
                >
                  <DriverPortrait
                    driver={driver}
                    team={team}
                    priority={index === 0}
                    className="aspect-[3/4] w-full"
                  />
                </BlurFadeReduced>
              ))}
            </div>

            <BlurFadeReduced delay={reducedMotion ? 0 : 0.3} inView>
              <div className="flex items-center gap-3 pt-2">
                <TeamMonogramTile team={team} size={20} />
                <span className="text-xs uppercase tracking-[0.15em] text-zinc-300">
                  {team.name}
                </span>
              </div>
            </BlurFadeReduced>
          </div>
        </div>
      </div>
    </section>
  );
}
