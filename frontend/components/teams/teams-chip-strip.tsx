'use client';

import { useEffect, useRef } from 'react';

import { TEAMS } from '@/data/teams-data';
import { cn } from '@/lib/utils';
import { ringOnDark } from '@/lib/team-utils';

interface TeamsChipStripProps {
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  reducedMotion: boolean;
}

/**
 * The below-`lg` team navigation.
 *
 * Extracted out of `teams-nav-rail.tsx`, where it lived behind a `mobile` prop. It needs
 * two behaviours the desktop rail must *not* have — the active item scrolls itself into
 * view, and the container carries overflow fades — so the shared component was two
 * components wearing one name.
 */
export function TeamsChipStrip({
  activeTeamId,
  onSelectTeam,
  reducedMotion,
}: TeamsChipStripProps) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Eleven chips overflow every phone, so the active chip is routinely off screen and the
  // strip gives no sign of where you are. Centre it whenever it changes — including when
  // scrolling changed it, not just on a tap.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeTeamId, reducedMotion]);

  return (
    <nav aria-label="Constructor navigation, compact" className="relative">
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TEAMS.map((team) => {
          const isActive = activeTeamId === team.id;
          return (
            <a
              key={team.id}
              ref={isActive ? activeRef : undefined}
              href={`#team-${team.id}`}
              onClick={() => onSelectTeam(team.id)}
              aria-current={isActive ? 'location' : undefined}
              className={cn(
                'relative flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-widest no-underline transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                // `zinc-400`, matching the rail: `zinc-500` is 4.12:1 on this background, and
                // this strip is the only navigation below `lg`, so it is the one a phone gets.
                isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
              // `--tw-ring-color`, not `outlineColor`: Tailwind's ring is a box-shadow and
              // reads its colour from that custom property. Cast through `unknown` first —
              // the branches' object shapes don't overlap enough for TS to allow a direct
              // `CSSProperties` cast on the union.
              style={
                {
                  '--tw-ring-color': ringOnDark(team.color),
                  ...(isActive
                    ? { backgroundColor: `${team.color}33`, border: `1px solid ${team.color}` }
                    : { border: '1px solid transparent' }),
                } as unknown as React.CSSProperties
              }
            >
              {team.shortName}
              {/* Position only. Points do not fit a chip, and the desktop rail carries them. */}
              <span className="ml-1.5 font-mono text-[9px] text-zinc-400">{`P${team.position}`}</span>
            </a>
          );
        })}
      </div>

      {/* Overflow affordance. Static rather than conditional: eleven chips overflow every
          viewport this strip is shown at, so a scrollability check would always say yes. */}
      <span
        data-testid="chip-fade"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-zinc-950 to-transparent"
      />
      <span
        data-testid="chip-fade"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent"
      />
    </nav>
  );
}
