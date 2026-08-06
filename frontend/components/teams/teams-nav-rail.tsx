'use client';

import { motion } from 'motion/react';

import { TEAMS } from '@/data/teams-data';
import { teamSectionId } from '@/hooks/use-team-navigation';
import { paletteFor, withAlpha } from '@/lib/team-utils';
import { cn } from '@/lib/utils';

interface TeamsNavRailProps {
  activeTeamId: string;
  onSelectTeam: (teamId: string) => void;
  /** False while the hero still owns the viewport — nothing is really "current" yet. */
  inSections: boolean;
}

/**
 * The left rail: navigation only. Every entry is a real anchor to `#team-<id>`, so it works with
 * middle-click, copy-link, and browser Find; the click handler only adds the smooth scroll and
 * the instant highlight.
 */
export function TeamsNavRail({ activeTeamId, onSelectTeam, inSections }: TeamsNavRailProps) {
  return (
    <nav
      aria-label="Constructors"
      className="flex h-full flex-col overflow-y-auto py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="mb-4 px-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Constructors</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-zinc-600">
          {`Grid order · ${TEAMS.length} teams`}
        </p>
      </div>

      <ol className="flex flex-col">
        {TEAMS.map((team, index) => {
          const isActive = inSections && team.id === activeTeamId;
          const palette = paletteFor(team.color);

          return (
            <li key={team.id}>
              <a
                href={`#${teamSectionId(team.id)}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onSelectTeam(team.id);
                }}
                className={cn(
                  'relative flex w-full items-center gap-2.5 rounded-r-md px-4 py-2.5 text-left text-sm transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100',
                )}
                style={{ ['--tw-ring-color' as string]: palette.ring }}
              >
                {isActive && (
                  <motion.span
                    layoutId="teams-nav-active"
                    className="absolute inset-0 rounded-r-md"
                    style={{
                      backgroundColor: palette.surface,
                      boxShadow: `inset 2px 0 0 ${team.color}, inset 0 0 30px ${withAlpha(team.color, 0.12)}`,
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                    aria-hidden="true"
                  />
                )}

                <span className="relative z-10 w-5 font-mono text-[10px] text-zinc-500">
                  <span className="sr-only">{`Team ${index + 1} of ${TEAMS.length}: `}</span>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                </span>

                <span
                  aria-hidden="true"
                  className="relative z-10 h-2 w-2 flex-shrink-0 rounded-full transition-shadow duration-300"
                  style={{
                    backgroundColor: team.color,
                    boxShadow: isActive ? `0 0 10px ${withAlpha(team.color, 0.9)}` : 'none',
                  }}
                />

                <span className="relative z-10 truncate font-medium">{team.shortName}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
