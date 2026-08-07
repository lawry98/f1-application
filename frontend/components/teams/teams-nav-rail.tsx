'use client';

import { motion } from 'motion/react';

import { TEAMS, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { readableOnDark } from '@/lib/team-utils';
import { TeamMonogramTile } from './team-monogram-tile';

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
  mobile?: boolean;
}

function NavButton({
  team,
  isActive,
  onClick,
  reducedMotion,
  mobile,
  index,
}: {
  team: Team;
  isActive: boolean;
  onClick: () => void;
  reducedMotion: boolean;
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
      {/* Active background highlight via shared layout. The highlight slides between rows on
          every section crossing, so under `reduce` it is cut to a straight cross-fade — the
          block still moves, it just no longer travels. */}
      {isActive && (
        <motion.div
          layoutId="teams-nav-active"
          className="absolute inset-0 rounded-r-md bg-zinc-800/60"
          transition={
            reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
          }
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
      <TeamMonogramTile team={team} size={22} className="relative z-10" />

      {/* Team name + standings */}
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
    </button>
  );
}

export function TeamsNavRail({
  activeTeamId,
  onSelectTeam,
  reducedMotion,
  mobile = false,
}: TeamsNavRailProps) {
  if (mobile) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TEAMS.map((team, i) => (
          <NavButton
            key={team.id}
            team={team}
            isActive={activeTeamId === team.id}
            onClick={() => onSelectTeam(team.id)}
            reducedMotion={reducedMotion}
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
          reducedMotion={reducedMotion}
          index={i}
        />
      ))}

      {/* Scroll-progress edge, driven by the active team's index, not scroll position */}
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
