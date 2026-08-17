'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Expand } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { teamColorButtonStyle, seasonsSince, readableOnDark } from '@/lib/team-utils';
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

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTeam.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          className="flex h-full min-h-0 flex-col"
        >
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

          {/* Championship standing — brief item 10. The dossier carried none of this before,
              which left the one always-visible panel silent about the season it describes. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center border-t border-zinc-800/60 px-4 py-4">
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
              {`Championship · ${STANDINGS_AS_OF}`}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                data-testid="standings-position"
                className="text-3xl font-black leading-none"
                // Large display text, but it is still text carrying the livery colour, so it
                // goes through the contrast layer like every other coloured label.
                style={{ color: readableOnDark(activeTeam.color) }}
              >
                {`P${activeTeam.position}`}
              </span>
              <span className="font-mono text-xs text-zinc-300">{`${activeTeam.points} PTS`}</span>
            </div>
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

          {/* Broadcast stat block */}
          <div className="flex-shrink-0 border-t border-zinc-800/60 px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">All-time</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                data-testid="championship-count"
                className="text-2xl font-black leading-none text-white"
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
            <Button
              onClick={onInspect}
              className={cn(
                'w-full gap-2 text-xs font-medium transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]',
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
