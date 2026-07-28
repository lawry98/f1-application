'use client';

import { motion } from 'motion/react';

import { TEAMS, type Team } from '@/data/teams-data';
import { cn } from '@/lib/utils';

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
        className={cn(
          'relative flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
          isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
        )}
        style={
          isActive
            ? {
                backgroundColor: `${team.color}33`,
                borderColor: team.color,
                border: `1px solid ${team.color}`,
              }
            : { border: '1px solid transparent' }
        }
      >
        {team.shortName}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
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

      {/* Color dot */}
      <span
        className="relative z-10 h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: team.color }}
      />

      {/* Team name */}
      <span className="relative z-10 truncate font-medium">{team.shortName}</span>
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
    <nav className="flex h-full flex-col justify-start overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
    </nav>
  );
}
