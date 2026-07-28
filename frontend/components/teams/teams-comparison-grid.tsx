'use client';

import { useCallback } from 'react';
import { motion } from 'motion/react';

import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Card } from '@/components/ui/card';
import { type Team } from '@/data/teams-data';

interface TeamsComparisonGridProps {
  teams: Team[];
  activeTeamId: string;
  reducedMotion: boolean;
  onScrollToTeam: (id: string) => void;
}

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

function getItemVariants(reducedMotion: boolean) {
  return {
    hidden: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 },
    show: reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };
}

export function TeamsComparisonGrid({
  teams,
  activeTeamId,
  reducedMotion,
  onScrollToTeam,
}: TeamsComparisonGridProps) {
  const itemVariants = getItemVariants(reducedMotion);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, teamId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onScrollToTeam(teamId);
      }
    },
    [onScrollToTeam],
  );

  return (
    <section className="bg-zinc-950 px-6 py-20 lg:px-12">
      {/* Section header */}
      <div className="mb-12">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-500">Overview</p>
        <TextAnimate
          as="h2"
          animation={reducedMotion ? 'fadeIn' : 'slideUp'}
          by="word"
          startOnView
          once
          className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl"
        >
          2026 Season Grid
        </TextAnimate>
      </div>

      <div className="mb-10 h-px w-full bg-zinc-800" />

      {/* Grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-100px' }}
      >
        {teams.map((team) => {
          const isActive = team.id === activeTeamId;
          return (
            <motion.div
              key={team.id}
              variants={itemVariants}
              role="button"
              tabIndex={0}
              aria-label={`Scroll to ${team.shortName}`}
              onClick={() => onScrollToTeam(team.id)}
              onKeyDown={(e) => handleKeyDown(e, team.id)}
              className="cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              whileHover={
                reducedMotion
                  ? {}
                  : {
                      y: -4,
                      boxShadow: `0 20px 40px ${team.color}30`,
                    }
              }
              transition={{ duration: 0.2 }}
            >
              <Card
                className="relative overflow-hidden border-zinc-800 bg-zinc-900/40 p-0 transition-colors duration-300"
                style={
                  isActive
                    ? {
                        outline: `2px solid ${team.color}`,
                        outlineOffset: '0px',
                      }
                    : {}
                }
              >
                {/* Top color bar */}
                <div className="h-[3px] w-full" style={{ backgroundColor: team.color }} />

                <div className="space-y-4 p-4">
                  {/* Team name row */}
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <p className="truncate text-sm font-bold uppercase tracking-wide text-white">
                      {team.shortName}
                    </p>
                  </div>

                  {/* Drivers */}
                  <div className="space-y-1">
                    {team.drivers.map((driver) => (
                      <div key={driver.id} className="flex items-center gap-2">
                        <span className="w-8 font-mono text-[10px] text-zinc-500">
                          #{driver.number}
                        </span>
                        <span className="truncate text-xs text-zinc-400">{driver.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="h-px bg-zinc-800" />

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">WCC</p>
                      <p className="mt-0.5 text-lg font-black text-white">
                        {team.championships > 0 ? (
                          <NumberTicker
                            value={team.championships}
                            className="text-lg font-black text-white"
                          />
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">Est.</p>
                      <p className="mt-0.5 text-lg font-black text-white">{team.firstEntry}</p>
                    </div>
                  </div>

                  {/* Base */}
                  <p className="truncate text-[10px] text-zinc-500">{team.base}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Footer note */}
      <p className="mt-10 text-center text-xs uppercase tracking-widest text-zinc-600">
        2026 Formula 1 World Championship
      </p>
    </section>
  );
}
