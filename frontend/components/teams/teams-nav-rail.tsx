'use client';

import { motion } from 'motion/react';

import { TEAMS, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';

/** First three alphabetic characters of a team's short name, uppercased. */
function monogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * Uniform square colour tile carrying a three-letter monogram — the rail's logo mark.
 *
 * Real wordmarks (`TeamLogo`) range from ~1:1 (Mercedes) to 9.48:1 (Aston Martin). Object-fit
 * into a shared box at this row's 22px height either leaves near-invisible slivers (Aston
 * Martin renders ~4px tall) or forces the box open across a 200px rail — neither reads as a
 * chip set. A flat monogram tile keeps every one of the eleven rows the same size and legible,
 * including `racing-bulls`, which has no logo file at all and would otherwise be the only
 * fallback square in a list of wordmarks. Full logos still belong on wider surfaces (the
 * sticky panel, the hero) via `TeamLogo` — this tile is local to the rail on purpose.
 */
function NavLogoTile({ team }: { team: Team }) {
  return (
    <div
      className="relative z-10 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded text-[8px] font-black leading-none"
      style={{
        backgroundColor: team.color,
        color: team.textOnColor === 'black' ? '#000000' : '#ffffff',
      }}
    >
      {monogram(team.shortName)}
    </div>
  );
}

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  mobile?: boolean;
}

function NavButton({
  team,
  isActive,
  onClick,
  mobile,
  index,
}: {
  team: Team;
  isActive: boolean;
  onClick: () => void;
  mobile?: boolean;
  index: number;
}) {
  if (mobile) {
    return (
      <button
        onClick={onClick}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
          'relative flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
          isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
        )}
        style={
          isActive
            ? {
                backgroundColor: `${team.color}33`,
                border: `1px solid ${team.color}`,
              }
            : { border: '1px solid transparent' }
        }
      >
        {team.shortName}
        <span className="ml-1.5 font-mono text-[9px] text-zinc-400">{`P${team.position}`}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-r-md px-4 py-2.5 text-left text-sm transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      {/* Active background highlight via shared layout */}
      {isActive && (
        <motion.div
          layoutId="teams-nav-active"
          className="absolute inset-0 rounded-r-md bg-zinc-800/60"
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />
      )}

      {/* Left border accent */}
      <div
        className="absolute left-0 top-0 h-full w-[2px] rounded-full transition-opacity duration-300"
        style={{
          backgroundColor: team.color,
          opacity: isActive ? 1 : 0,
        }}
      />

      {/* Index number */}
      <span className="relative z-10 w-5 font-mono text-[10px] text-zinc-600">
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Logo chip */}
      <NavLogoTile team={team} />

      {/* Team name + standings */}
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{team.shortName}</span>
        <span
          className="block truncate font-mono text-[9px] tracking-wide"
          style={{ color: isActive ? team.color : '#71717a' }}
        >
          {`P${team.position} · ${team.points} PTS`}
        </span>
      </span>
    </button>
  );
}

export function TeamsNavRail({ activeTeamId, onSelectTeam, mobile = false }: TeamsNavRailProps) {
  if (mobile) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TEAMS.map((team, i) => (
          <NavButton
            key={team.id}
            team={team}
            isActive={activeTeamId === team.id}
            onClick={() => onSelectTeam(team.id)}
            mobile
            index={i}
          />
        ))}
      </div>
    );
  }

  return (
    <nav className="relative flex h-full flex-col justify-start overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <p className="mb-4 px-4 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Constructors</p>
      {TEAMS.map((team, i) => (
        <NavButton
          key={team.id}
          team={team}
          isActive={activeTeamId === team.id}
          onClick={() => onSelectTeam(team.id)}
          index={i}
        />
      ))}

      {/* Scroll-progress edge, driven by the active team's index, not scroll position */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-full w-[2px] bg-zinc-900"
      >
        <span
          className="block w-full origin-top bg-zinc-600 transition-transform duration-300"
          style={{
            height: '100%',
            transform: `scaleY(${(TEAMS.findIndex((t) => t.id === activeTeamId) + 1) / TEAMS.length})`,
          }}
        />
      </span>
    </nav>
  );
}
