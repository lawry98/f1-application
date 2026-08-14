'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Expand } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MegaStat } from '@/components/candy/mega-stat';
import { cn } from '@/lib/utils';
import { focusRingOffsetBase } from '@/lib/focus';
import {
  teamColorButtonStyle,
  seasonsSince,
  railStandingColor,
  ringOnDark,
  RAIL_ACTIVE_FILL,
  RAIL_ACTIVE_ALPHA,
} from '@/lib/team-utils';
import { TEAMS, STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { TeamLogo } from './team-logo';

interface StickyTeamPanelProps {
  activeTeam: Team;
  onInspect: () => void;
}

/** The most-decorated constructor, so championship bars share one scale. */
const MOST_CHAMPIONSHIPS = Math.max(...TEAMS.map((t) => t.championships));

/** The championship leader's total, so points bars share one scale. `1` floors a zeroed season. */
const MOST_POINTS = Math.max(...TEAMS.map((t) => t.points), 1);

/**
 * Widest the logo lockup may render inside the rail's `px-4` gutters. The rail itself is
 * only 300px wide (360 at xl); a `max-w-*` class would lose to `TeamLogo`'s inline style,
 * so this is passed as the `maxWidth` prop instead of relying on the component's default
 * (`size * 4`), which is wide enough to crowd the 300px column.
 */
const LOGO_MAX_WIDTH = 200;

/**
 * `MegaStat`'s own tick bar, copied verbatim so the two block labels below match the one the
 * `MegaStat` in this panel already draws above its `Points` label.
 *
 * The spec's line is "All-time bar and stat labels take MegaStat red tick marks". It is a `div`
 * rather than a `span` because `h-1.5 w-5` does nothing to a non-replaced inline box, and unlike
 * the branch's section kicker — which gets away with a `span` by sitting in a `flex` row, where
 * the item is blockified — these marks stack *above* their label. Red as a bar is unconstrained:
 * the 4.01:1 floor `f1-red` measures on the dark page applies to red text.
 */
const TICK_CLASS = 'pointer-events-none mb-2 h-1.5 w-5 bg-f1-red';

/**
 * The ordinal chip's translucent fill, built from the two rail constants instead of being written
 * out as `#27272a99`.
 *
 * The chip is the rail's active-row highlight in miniature — `zinc-800` at 0.6 over the page — and
 * building the declaration from the same two constants the contrast maths uses is what makes that
 * claim checkable rather than asserted. Written `rgba()` so the alpha stays the same decimal
 * `RAIL_ACTIVE_ALPHA` holds and a test can compare the painted value against it without converting
 * a hex byte first.
 */
const CHIP_FILL = ((): string => {
  const packed = parseInt(RAIL_ACTIVE_FILL.slice(1), 16);
  return `rgba(${(packed >> 16) & 255}, ${(packed >> 8) & 255}, ${packed & 255}, ${RAIL_ACTIVE_ALPHA})`;
})();

/** Indexed by `n % 10`. `0` is `TH` (10th, 20th), and 1/2/3 are the three irregular ones. */
const ORDINAL_SUFFIX = ['TH', 'ST', 'ND', 'RD'] as const;

/**
 * `1ST`, `2ND`, `11TH` — English ordinal suffix for a championship position.
 *
 * The 11–13 exception is real on this grid rather than defensive: there are exactly eleven
 * constructors, so P11 is a live case every season and the naive `n % 10` rule would render
 * Cadillac's standing as `11ST`.
 */
function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'TH';
  return ORDINAL_SUFFIX[n % 10] ?? 'TH';
}

/**
 * The championship position as a pill beside the points numeral — the spec's `1^ST` ordinal chip.
 *
 * **Passed to `MegaStat` as an element, not a string, and that is the whole reason `ordinal` was
 * widened to `ReactNode`.** A string ordinal gets `align-super text-[0.35em]`, which against a 72px
 * numeral would shrink the pill to a third of a line and hang it off the baseline.
 *
 * **The colour helper is `railStandingColor`, and the chip's fill is why.** The obvious choice,
 * `readableOnDark`, is wrong here for the reason `CLAUDE.md` records this page shipping twice: it
 * stops at the first lightness step clearing 4.5:1 on *bare* `zinc-950`, so it has zero headroom,
 * and this text does not sit on bare `zinc-950` — it sits on `CHIP_FILL`, a `zinc-800` wash at 0.6.
 * That composite is byte-for-byte `railStandingBackdrop()`, the active rail row's, so
 * `railStandingColor` is not an approximation of the right helper but exactly it. On that backdrop
 * `readableOnDark` leaves seven of the eleven liveries between 3.93 and 4.04. `sticky-team-panel.
 * test.tsx` measures every team against `railStandingBackdrop()` rather than against the page,
 * which is the assertion that makes this a fact instead of a claim.
 *
 * The border takes `ringOnDark` instead: a keyline is non-text and held to WCAG's 3:1 bar, and
 * lifting it to the text bar would wash the darker liveries out for no legibility gain.
 *
 * `role="img"` + `aria-label` rather than an `sr-only` twin, for both of this repo's documented
 * reasons: a bare `<span>` has the implicit role `generic`, on which ARIA 1.2 *prohibits*
 * `aria-label` (browsers drop it, axe flags `aria-prohibited-attr`), and an sr-only twin sitting
 * beside painted glyphs is the exact shape that made a contrast checker read the invisible copy and
 * report 1:1. The label spells the position out — `1ST` alone, announced next to a points total,
 * is the same "is that a rank or a sequence?" ambiguity the `Team N of 11` counter above already
 * had to be spelled out to avoid.
 */
function PositionChip({ position, color }: { position: number; color: string }) {
  return (
    <span
      data-testid="position-chip"
      role="img"
      aria-label={`Championship position ${position}`}
      className="ml-2 inline-flex items-baseline rounded-full border px-2 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{
        color: railStandingColor(color),
        borderColor: ringOnDark(color),
        backgroundColor: CHIP_FILL,
      }}
    >
      {position}
      <sup className="ml-px text-[0.7em]">{ordinalSuffix(position)}</sup>
    </span>
  );
}

/**
 * The cross-fade every block in this rail that *may* remount shares.
 *
 * Authored once because there are two such blocks now rather than one: the points stat between
 * them is deliberately outside both (see `StickyTeamPanel`), and two hand-copied spring configs
 * either side of it would be free to drift apart and desynchronise the swap.
 */
const SWAP_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: 'spring', duration: 0.3, bounce: 0 },
} as const;

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-0.5 text-xs text-zinc-200">{value}</p>
    </div>
  );
}

export function StickyTeamPanel({ activeTeam, onInspect }: StickyTeamPanelProps) {
  const ctaStyle = teamColorButtonStyle(activeTeam);
  const index = TEAMS.findIndex((t) => t.id === activeTeam.id);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div
        className="absolute left-0 right-0 top-0 z-10 h-[2px] transition-colors duration-500"
        style={{ backgroundColor: activeTeam.color }}
      />

      {/*
        **Three blocks, not one, and the split is the fix for a real defect.**

        This whole panel used to be a single `AnimatePresence mode="wait"` child keyed on
        `activeTeam.id`, which meant every team change remounted the entire subtree — including the
        `MegaStat`. A remounted `MegaStat` is a *new* instance: its `useInView(once: true)` starts
        over and its spring starts over, so the points numeral counted up from 0 again. Scrolling
        the page once fired ~11 count-ups on the single number this rail exists to show, and
        `MegaStat`'s own `ONCE_IN_VIEW` comment says the once-ness exists precisely to prevent that
        — the remount defeated it from the outside, where nothing in that file could see it.

        So the stat is **hoisted out of the keyed subtree** and the swap wraps what sits either side
        of it. Its `value` prop now changes on a live instance, and `MegaStat`'s effect calls
        `motionValue.set(next)`, so the spring travels from the outgoing team's total to the
        incoming one's — the numeral animates *between* figures, which is what a standings rail
        should do anyway.

        The two surviving blocks keep the cross-fade they had. They are separate `AnimatePresence`
        elements rather than one, because DOM order puts the stat between them and the visual order
        is not negotiable. They share `SWAP_MOTION` and the same key, so they enter and leave in
        lockstep.

        The layout is preserved by hoisting these children into the panel's own flex column, which
        is the same `flex h-full flex-col` the removed wrapper was. All three are `flex-shrink-0`
        and none of them grows — see the note on the championship block for why the stat no longer
        takes `flex-1`. jsdom lays nothing out, so no test in this file can confirm that — it is a
        browser check.
      */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTeam.id} {...SWAP_MOTION} className="flex-shrink-0">
          {/*
            Spelled out, because a bare `02 / 11` sitting next to a championship position is
            the ambiguity brief item 2 is about — and this counter used to read
            "Constructor 05 / 11" for a team standing P7, since TEAMS order is not
            standings order.
          */}
          <p className="px-4 pt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            {`Team ${index + 1} of ${TEAMS.length}`}
          </p>

          {/* Logo lockup over livery stripes */}
          <div className="relative flex h-[120px] flex-shrink-0 items-center justify-center px-4">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.18]"
              style={{
                background: `repeating-linear-gradient(115deg, ${activeTeam.color} 0 3px, transparent 3px 14px)`,
              }}
            />
            <TeamLogo
              team={activeTeam}
              size={56}
              maxWidth={LOGO_MAX_WIDTH}
              className="relative z-10"
            />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Championship standing — brief item 10. The dossier carried none of this before,
              which left the one always-visible panel silent about the season it describes.

              Deliberately outside the swap above: see the block comment on it.

              **`flex-shrink-0`, not `flex-1 justify-center`, and the numbers are the argument.**
              The dossier is `h-[calc(100vh-3.5rem)]` — 844px at 1440×900 — while its three blocks
              only want 528px. As the column's one growing child this block absorbed all 316px of
              that slack and then centred 124px of content inside 442px of padding box, so the
              points stat sat in the middle of two 159px holes (measured in Chromium at 1440;
              1280 is the same block in a 300px column and behaves identically). Not growing is
              what closes them: a flex column's default `justify-content` is flex-start, so the
              three blocks now pack from the top and the whole 316px falls below the CTA, where it
              is the rail simply ending rather than a gap punched through the middle of it.

              The two alternatives were tried in the browser and both only move the hole: giving
              the *bottom* block the growth instead pins the CTA to the floor and opens the same
              316px between the points bar and the `All-time` rule, and splitting the growth
              between them reproduces the original two-void layout a block lower. `h-full` and
              `overflow-hidden` stay on the panel root so a viewport short enough to under-run
              528px still clips rather than spilling out of the sticky column. */}
      <div className="flex flex-shrink-0 flex-col border-t border-zinc-800/60 px-4 py-4">
        {/* **No tick above this label, and that is a decision made from a screenshot.** The
                first version put one here as well, to match the `All-time` block — but the
                `MegaStat` immediately below brings its own tick above its own `POINTS` label, so
                the block rendered two identical 20x6 red marks 12px apart with one line of 9px
                caps between them. At 1280 in Chromium that reads as a doubled rule rather than as
                two labelled stats. The spec's "stat labels take MegaStat red tick marks" is still
                satisfied: the points stat has one (MegaStat's own) and the all-time stat has one.
                This line is the *date* on the stat below it, not a stat of its own. */}
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
          {`Championship · ${STANDINGS_AS_OF}`}
        </p>
        {/*
              The spec's centrepiece for this rail: "Right-rail points become a MegaStat — 379 with
              a POINTS label and a 1ST ordinal chip; the championship leader alone gets
              Scribble type='p1' across its numeral."

              `scale="mid"`, never `mega`, and the numbers are the argument. `.text-mega` is
              `clamp(4rem, 14vw, 12rem)` measured against the **viewport**, not this column, so at
              1440 it resolves to its 192px cap inside a rail that is 300px wide (360 at xl) with
              `px-4` gutters — 268px of usable width, which `379` alone would overflow before the
              chip is added. `mid` is `clamp(2.5rem, 6vw, 4.5rem)`, i.e. 72px at 1440, which puts
              `379` at roughly 130px and leaves the chip room on the same line.

              `label="Points"` is the spec's POINTS label: `MegaStat` renders it as an 11px zinc-400
              small-caps run under its own red tick bar, so it uppercases visually and needs no tick
              or label of ours above it. It also carries the unit the removed `379 PTS` line used to.

              `scribbleClassName` is passed even though `text-f1-red` is the value we want. The mark
              is locked to that colour, and `[&_svg]:text-…` is `Scribble`'s only recolour hatch — a
              bare `text-…` on the wrapper cascades into the annotated numeral — so spelling it out
              here puts the hook in front of whoever next needs a different colour.

              **`opacity-[0.72]` on the mark, and it is a legibility fix made from a screenshot.**
              `p1` is `preserveAspectRatio="xMidYMid meet"` over a `-inset-y-[26%]` box, so against
              a 72px numeral it draws ~93px tall and ~96px wide, centred — which over a *three
              digit* value lands the P across `37` and the 1 through the `9`. Captured at 1440 and
              upscaled, `379` was not readable at all, and the points total is the one number this
              rail exists to show. At 0.72 the scrawl still reads as a hand-written P1 over the
              value while the digits come through it. Scaling the mark down instead was rejected:
              it stays centred at any scale, so it keeps crossing the middle digit, and it also
              stops overshooting the numeral, which is the thing that makes it look drawn rather
              than set (see the `overlay` comment on `p1` in `scribble.tsx`).
            */}
        <MegaStat
          scale="mid"
          value={activeTeam.points}
          label="Points"
          ordinal={<PositionChip position={activeTeam.position} color={activeTeam.color} />}
          scribble={activeTeam.position === 1 ? 'p1' : undefined}
          scribbleClassName="[&_svg]:text-f1-red [&_svg]:opacity-[0.72]"
        />
        <span className="mt-2 h-[7px] overflow-hidden bg-zinc-800">
          <span
            className="block h-full origin-left"
            style={{
              backgroundColor: activeTeam.color,
              transform: `scaleX(${activeTeam.points / MOST_POINTS})`,
            }}
          />
        </span>
      </div>

      {/* The second half of the swap: the all-time block and the CTA, which have no spring of
          their own to restart and so lose nothing by remounting. Same key and same
          `SWAP_MOTION` as the block above, so the two cross-fade together. */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTeam.id} {...SWAP_MOTION} className="flex-shrink-0">
          {/* Broadcast stat block */}
          <div className="flex-shrink-0 border-t border-zinc-800/60 px-4 py-3">
            <div aria-hidden="true" className={TICK_CLASS} />
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">All-time</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                data-testid="championship-count"
                className="text-2xl font-black leading-none text-ink"
              >
                {activeTeam.championships > 0 ? activeTeam.championships : '—'}
              </span>
              <span className="h-[7px] flex-1 overflow-hidden bg-zinc-800">
                <span
                  className="block h-full origin-left"
                  style={{
                    backgroundColor: activeTeam.color,
                    transform: `scaleX(${activeTeam.championships / MOST_CHAMPIONSHIPS})`,
                  }}
                />
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3">
              <MetaCell label="Base" value={activeTeam.base} />
              <MetaCell label="Power unit" value={activeTeam.powerUnit} />
              <MetaCell label="First entry" value={String(activeTeam.firstEntry)} />
              <MetaCell label="Seasons" value={String(seasonsSince(activeTeam.firstEntry))} />
            </div>
          </div>

          <div className="flex-shrink-0 px-4 pb-4">
            {/* `focusRingOffsetBase`, because this button is *filled* — with the livery, or with
                `#27272a` once `needsDamping` steps a bright one down — and a ring drawn hard
                against a livery fill takes its contrast from that fill rather than from the page
                (measured: red on Alpine's `#008bf6` is 1.42:1). The 2px `base` band separates the
                two, and it is genuinely invisible here: sampled either side of this control the
                dossier's backdrop reads `#09090b`, i.e. `base` itself, which is the condition
                `lib/focus.ts` rule 3 attaches to using an offset at all. */}
            <Button
              onClick={onInspect}
              className={cn(
                'w-full gap-2 text-xs font-medium transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]',
                focusRingOffsetBase,
                ctaStyle.className,
              )}
              style={ctaStyle.style}
            >
              <Expand className="h-3.5 w-3.5" />
              Inspect in 3D
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
