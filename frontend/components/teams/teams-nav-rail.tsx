'use client';

import { useRef } from 'react';
import { motion, useInView } from 'motion/react';

import { TEAMS, STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { railStandingColor, ringOnDark } from '@/lib/team-utils';
import { TeamMonogramTile } from './team-monogram-tile';

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
}

/**
 * Per-row entrance stagger, in seconds.
 *
 * 40ms is the spec's own number for this rail and it **overrides** the branch-wide 80–120ms
 * child stagger. That rule is written for editorial content — three or four cards easing in
 * under a headline — and this is neither editorial nor three items: eleven rows at 120ms would
 * still be assembling themselves 1.32s after the page settled, on the control the reader uses to
 * navigate. At 40ms the whole cascade closes in 400ms, which reads as one gesture rather than as
 * eleven.
 */
export const RAIL_ROW_STAGGER_S = 0.04;

/**
 * The entrance duration. 500ms is the floor of the branch's 500–900ms band, chosen because the
 * last row's delay stacks on top of it — 400ms of stagger plus 500ms of travel is 900ms end to
 * end, which is the band's ceiling for the *whole* cascade rather than for one row of it.
 */
const RAIL_ROW_DURATION_S = 0.5;

/**
 * How long row `index` waits before it slides in.
 *
 * Exported so the stagger can be asserted as arithmetic rather than read back off a rendered
 * motion element's props. Reading the prop would need a partial mock of `motion/react` that
 * replaces `motion.a` with a prop-recording stub, and that mock tests the mock: it proves the
 * component passed *a* transition, not that the eleven delays form the intended ramp. A pure
 * function is the thing worth pinning, and the component has exactly one caller of it.
 *
 * Under reduced motion every row is 0 — not "a smaller stagger". A cascade that still cascades,
 * only faster, is still the motion the preference asked to be spared.
 */
export function railRowDelay(index: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : index * RAIL_ROW_STAGGER_S;
}

function NavLink({
  team,
  index,
  isActive,
  isRailInView,
  onSelect,
  reducedMotion,
}: {
  team: Team;
  index: number;
  isActive: boolean;
  /**
   * Hoisted out of the row on purpose. A per-row `whileInView` would spawn eleven independent
   * observers that all fire at slightly different scroll positions, so the 40ms ramp would only
   * be the ramp when the whole rail crossed the threshold in one frame. One observer on the
   * `<nav>` keeps the eleven in lockstep — and since the rail is sticky and effectively always on
   * screen, that single trigger is on-mount in practice anyway.
   */
  isRailInView: boolean;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
}) {
  // Transform and opacity only, so the entrance cannot reflow the rail and CLS stays 0. -8px is
  // deliberately small: the rail is 200px wide and a longer throw would push the monogram tiles
  // off their own column and read as a layout bug rather than as an entrance.
  const hidden = { opacity: 0, x: -8 };
  const shown = { opacity: 1, x: 0 };

  return (
    <motion.a
      href={`#team-${team.id}`}
      // No preventDefault. The browser's own fragment navigation does the scrolling —
      // against `scroll-mt-[var(--teams-scroll-offset)]` on the section — and adds exactly
      // one history entry, which is the push semantics brief item 4 asks for. All this
      // handler does is claim the active id so the highlight moves before the scroll lands.
      onClick={() => onSelect(team.id)}
      aria-current={isActive ? 'location' : undefined}
      className={cn(
        // `group` exists for the left rule below, which reveals on hover as well as on selection.
        'group relative flex w-full items-center gap-2.5 rounded-r-md px-4 py-2.5 text-left text-sm no-underline transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        // `zinc-400`, not `zinc-500`: the 500 rung is 4.12:1 on this page background, so every
        // inactive row was under AA. There is no rung between it and 400's 7.44:1, which is why
        // the row's own hierarchy is carried by size and weight rather than by a dimmer tone.
        isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
      )}
      // A team-derived focus ring, held to non-text contrast rather than the text bar so it
      // still reads as the livery instead of a lightened wash of it.
      //
      // Tailwind's `ring-*` utilities are box-shadow, not outline, and take their colour from
      // the `--tw-ring-color` custom property. Setting `outlineColor` here would do nothing
      // and would leave the ring at Tailwind's default translucent blue, because there is no
      // `ring-<color>` class on this element any more.
      style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
      // `initial={false}` under reduced motion, not `initial={hidden}` with a zero duration:
      // the latter still commits `opacity: 0` to the DOM for one frame before motion overwrites
      // it, and on the page's primary navigation a frame of invisible links is worth avoiding.
      // `false` tells motion to mount straight at `animate` and never run an entrance at all.
      initial={reducedMotion ? false : hidden}
      // The row is animated, never gated on `isRailInView` — the eleven anchors are in the DOM,
      // focusable and clickable from first render whatever the observer says. A stuck animation
      // here has to be cosmetic; it must never be the reason a reader cannot navigate.
      animate={reducedMotion || isRailInView ? shown : hidden}
      transition={
        reducedMotion
          ? { duration: 0 }
          : {
              duration: RAIL_ROW_DURATION_S,
              delay: railRowDelay(index, reducedMotion),
              ease: [0.16, 1, 0.3, 1],
            }
      }
    >
      {isActive && (
        <motion.span
          layoutId="teams-nav-active"
          className="absolute inset-0 rounded-r-md bg-zinc-800/60"
          transition={
            reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
          }
        />
      )}

      {/*
        The selection rule. Red, not the livery: eleven liveries lit at once is what made the
        active row hard to find here in the first place, and red is the page's one saturated
        colour precisely so that a single red mark reads as "you are here". The row is still
        identified *by team* through the monogram tile and, when active, through the livery on
        its standings line — the rule answers "which row", not "which team".

        Red as a fill is unconstrained by contrast; it is only red *text* that has to clear
        4.5:1 at 4.01:1 on this background, which it does not.

        `group-hover:` on a decoration is fine, and it is worth saying why, because the same
        pattern on copy would not be: the contrast helpers judge a *resting* colour, and hover is
        a transient state the reader is actively driving. A `hover:text-…` still has to clear the
        bar in its resting state — the row label above does, at `zinc-400`. A 2px bar carries no
        text at any state and is outside the text bar entirely.

        `cn` merges through tailwind-merge, so the `opacity-100` on the active row wins over the
        resting `opacity-0` while `group-hover:opacity-100` survives both — a different variant is
        a different key to the merger.
      */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0 h-full w-[2px] rounded-full bg-f1-red opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          isActive && 'opacity-100',
        )}
      />

      <TeamMonogramTile team={team} size={22} className="relative z-10" />

      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{team.shortName}</span>
        <span
          className="block truncate font-mono text-[9px] tracking-wide"
          // 9px text, so the livery colour has to clear AA — and on the active row it has to
          // clear it against the `bg-zinc-800/60` highlight it renders on, not against the page.
          // `readableOnDark` measured 4.02:1 in a browser for Ferrari here; `railStandingColor`
          // judges the composite. Inactive rows are on the page itself, at `zinc-400`.
          style={{ color: isActive ? railStandingColor(team.color) : '#a1a1aa' }}
        >
          {`P${team.position} · ${team.points} PTS`}
        </span>
      </span>
    </motion.a>
  );
}

export function TeamsNavRail({ activeTeamId, onSelectTeam, reducedMotion }: TeamsNavRailProps) {
  const railRef = useRef<HTMLElement>(null);
  // One observer for eleven rows, and `once` so the cascade cannot replay. The rail is sticky
  // and stays on screen for the whole page, so a re-firing trigger would never re-fire anyway —
  // but a future layout that scrolls it away must not turn the navigation into a flicker.
  const isRailInView = useInView(railRef, { once: true, margin: '-15% 0px' });

  return (
    <nav
      ref={railRef}
      aria-label="Constructors"
      className="relative flex h-full flex-col justify-start overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/*
        The header names the numbers underneath it. Before this the rail showed a
        document-order `01`–`11` next to `P7 · 21 PTS` with nothing saying which was which —
        and because TEAMS order agrees with the standings for exactly the first four rows,
        it read as a standings list that was wrong. The sequence numeral is gone and what
        remains is labelled.
      */}
      {/*
        Both lines are stepped above AA rather than dimmed for hierarchy: `zinc-600` measured
        2.57:1 and `zinc-500` 4.12:1 on this background, so the step runs 300 → 400 and the
        11px/9px size difference does the rest.
      */}
      <div className="mb-4 px-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-300">Constructors</p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-400">
          {`Championship · ${STANDINGS_AS_OF}`}
        </p>
      </div>

      {TEAMS.map((team, index) => (
        <NavLink
          key={team.id}
          team={team}
          index={index}
          isActive={activeTeamId === team.id}
          isRailInView={isRailInView}
          onSelect={onSelectTeam}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* Scroll-progress edge, driven by the active team's position in document order —
          which is what it honestly measures. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-full w-[2px] bg-zinc-900"
      >
        <span
          className={cn(
            'block w-full origin-top bg-zinc-600',
            // The active team changes on every section crossing — eleven animations per
            // scroll of the page — so this is exactly the motion `reduce` asks to be spared.
            !reducedMotion && 'transition-transform duration-300',
          )}
          style={{
            height: '100%',
            transform: `scaleY(${(TEAMS.findIndex((t) => t.id === activeTeamId) + 1) / TEAMS.length})`,
          }}
        />
      </span>
    </nav>
  );
}
