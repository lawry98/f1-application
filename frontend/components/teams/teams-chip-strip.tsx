'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { TEAMS } from '@/data/teams-data';
import { teamSectionId } from '@/hooks/use-team-navigation';
import { paletteFor } from '@/lib/team-utils';
import { cn } from '@/lib/utils';

interface TeamsChipStripProps {
  activeTeamId: string;
  onSelectTeam: (teamId: string) => void;
  inSections: boolean;
  reducedMotion: boolean;
}

/**
 * The sticky horizontal team navigation shown below `xl`, where the left rail is hidden.
 *
 * Keeps the active chip centred as you scroll the page, and fades its own edges so the eleventh
 * team never looks like the last one. The fades are decorative overlays, not masks, so chip text
 * stays fully selectable and hit-testable underneath.
 */
export function TeamsChipStrip({
  activeTeamId,
  onSelectTeam,
  inSections,
  reducedMotion,
}: TeamsChipStripProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const activeChipRef = useRef<HTMLAnchorElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // Centre the active chip. Scrolls the strip directly rather than via `scrollIntoView`, which
  // would also drag the page vertically and fight the scroll spy.
  useEffect(() => {
    if (!inSections) return;
    const scroller = scrollerRef.current;
    const chip = activeChipRef.current;
    if (!scroller || !chip) return;

    const target = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
    const clamped = Math.max(0, Math.min(target, scroller.scrollWidth - scroller.clientWidth));
    if (Math.abs(clamped - scroller.scrollLeft) < 2) return;
    scroller.scrollTo({ left: clamped, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [activeTeamId, inSections, reducedMotion]);

  return (
    <div className="relative">
      <nav aria-label="Constructors">
        <ul
          ref={scrollerRef}
          className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TEAMS.map((team, index) => {
            const isActive = inSections && team.id === activeTeamId;
            const palette = paletteFor(team.color);

            return (
              <li key={team.id} className="flex-shrink-0">
                <a
                  ref={isActive ? activeChipRef : undefined}
                  href={`#${teamSectionId(team.id)}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    onSelectTeam(team.id);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                    isActive ? 'text-white' : 'border-transparent text-zinc-400 hover:text-white',
                  )}
                  style={{
                    ['--tw-ring-color' as string]: palette.ring,
                    ...(isActive
                      ? { backgroundColor: palette.surfaceStrong, borderColor: palette.border }
                      : {}),
                  }}
                >
                  <span className="sr-only">{`Team ${index + 1} of ${TEAMS.length}: `}</span>
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  {team.shortName}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Overflow affordances */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-zinc-950 to-transparent transition-opacity duration-200',
          overflow.start ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-zinc-950 to-transparent transition-opacity duration-200',
          overflow.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
