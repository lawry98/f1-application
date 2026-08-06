'use client';

import { motion } from 'motion/react';

import { TEAMS, STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { readableOnDark, ringOnDark } from '@/lib/team-utils';
import { TeamMonogramTile } from './team-monogram-tile';

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
}

function NavLink({
  team,
  isActive,
  onSelect,
  reducedMotion,
}: {
  team: Team;
  isActive: boolean;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
}) {
  return (
    <a
      href={`#team-${team.id}`}
      // No preventDefault. The browser's own fragment navigation does the scrolling —
      // against `scroll-mt-[var(--teams-scroll-offset)]` on the section — and adds exactly
      // one history entry, which is the push semantics brief item 4 asks for. All this
      // handler does is claim the active id so the highlight moves before the scroll lands.
      onClick={() => onSelect(team.id)}
      aria-current={isActive ? 'location' : undefined}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-r-md px-4 py-2.5 text-left text-sm no-underline transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
      )}
      // A team-derived focus ring, held to non-text contrast rather than the text bar so it
      // still reads as the livery instead of a lightened wash of it.
      //
      // Tailwind's `ring-*` utilities are box-shadow, not outline, and take their colour from
      // the `--tw-ring-color` custom property. Setting `outlineColor` here would do nothing
      // and would leave the ring at Tailwind's default translucent blue, because there is no
      // `ring-<color>` class on this element any more.
      style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
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

      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-[2px] rounded-full transition-opacity duration-300"
        style={{ backgroundColor: team.color, opacity: isActive ? 1 : 0 }}
      />

      <TeamMonogramTile team={team} size={22} className="relative z-10" />

      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{team.shortName}</span>
        <span
          className="block truncate font-mono text-[9px] tracking-wide"
          // 9px text, so the livery colour has to clear AA — seven of eleven do not raw.
          style={{ color: isActive ? readableOnDark(team.color) : '#71717a' }}
        >
          {`P${team.position} · ${team.points} PTS`}
        </span>
      </span>
    </a>
  );
}

export function TeamsNavRail({ activeTeamId, onSelectTeam, reducedMotion }: TeamsNavRailProps) {
  return (
    <nav
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
      <div className="mb-4 px-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Constructors</p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          {`Championship · ${STANDINGS_AS_OF}`}
        </p>
      </div>

      {TEAMS.map((team) => (
        <NavLink
          key={team.id}
          team={team}
          isActive={activeTeamId === team.id}
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
