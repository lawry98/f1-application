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
}: {
  team: Team;
  isActive: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  if (mobile) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'relative flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition-colors duration-200',
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
        'relative flex w-full items-center gap-3 rounded-r-md px-4 py-2.5 text-left text-sm transition-colors duration-200',
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
        {TEAMS.map((team) => (
          <NavButton
            key={team.id}
            team={team}
            isActive={activeTeamId === team.id}
            onClick={() => onSelectTeam(team.id)}
            mobile
          />
        ))}
      </div>
    );
  }

  return (
    <nav className="flex h-full flex-col justify-start overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <p className="mb-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        Constructors
      </p>
      {TEAMS.map((team) => (
        <NavButton
          key={team.id}
          team={team}
          isActive={activeTeamId === team.id}
          onClick={() => onSelectTeam(team.id)}
        />
      ))}
    </nav>
  );
}
