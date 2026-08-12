'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/utils';
import { ringOnDark } from '@/lib/team-utils';
import { STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { TeamMonogramTile } from './team-monogram-tile';

type SortKey = 'points' | 'championships' | 'firstEntry';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'points', label: 'Points' },
  { key: 'championships', label: 'Titles' },
  { key: 'firstEntry', label: 'Since' },
];

/**
 * How the currently-sorted metric reads aloud, singular-aware.
 *
 * Each row's rank, bar and number are sighted-only: the bar is `aria-hidden` decoration and
 * the button's `aria-label` overrides all of its inner text. Without this a screen-reader user
 * heard "Jump to Mercedes, button" eleven times and learned no standing at all — the section
 * is a championship table, so the standing *is* the content.
 */
function metricPhrase(sort: SortKey, team: Team): string {
  if (sort === 'firstEntry') return `first entered ${team.firstEntry}`;
  if (sort === 'championships') {
    return `${team.championships} ${team.championships === 1 ? 'championship' : 'championships'}`;
  }
  return `${team.points} ${team.points === 1 ? 'point' : 'points'}`;
}

interface TeamsComparisonGridProps {
  teams: Team[];
  activeTeamId: string;
  reducedMotion: boolean;
  onSelectTeam: (id: string) => void;
}

export function TeamsComparisonGrid({
  teams,
  activeTeamId,
  reducedMotion,
  onSelectTeam,
}: TeamsComparisonGridProps) {
  const [sort, setSort] = useState<SortKey>('points');

  const ranked = useMemo(() => {
    const copy = [...teams];
    // firstEntry sorts ascending (oldest first); the other two descending.
    copy.sort((a, b) => (sort === 'firstEntry' ? a[sort] - b[sort] : b[sort] - a[sort]));
    return copy;
  }, [teams, sort]);

  const leader = useMemo(
    () => Math.max(...teams.map((t) => t[sort === 'firstEntry' ? 'points' : sort]), 1),
    [teams, sort],
  );

  const handleSort = useCallback((key: SortKey) => setSort(key), []);

  return (
    <section className="bg-zinc-950 px-6 py-20 lg:px-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-400">Overview</p>
          <TextAnimate
            as="h2"
            animation={reducedMotion ? 'fadeIn' : 'slideUp'}
            by="word"
            startOnView
            once
            className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl"
          >
            Constructors&apos; Championship
          </TextAnimate>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          {STANDINGS_AS_OF}
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {SORTS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            aria-pressed={sort === key}
            className={cn(
              'rounded px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-[background-color,color,border-color] duration-200 active:scale-[0.96]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
              sort === key
                ? 'bg-zinc-800 text-white'
                : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Names the leading numeral. It is neither the championship position nor the page's
          running order — it is the rank under the active sort, and it moves with the tab. */}
      <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-zinc-400">
        {`Rank by ${SORTS.find((s) => s.key === sort)!.label.toLowerCase()}`}
      </p>

      <div className="flex flex-col">
        {ranked.map((team, i) => {
          const metric = sort === 'firstEntry' ? team.points : team[sort];
          return (
            <motion.a
              key={team.id}
              href={`#team-${team.id}`}
              layout={!reducedMotion}
              transition={
                reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
              }
              onClick={() => onSelectTeam(team.id)}
              // Team name first, so the eleven rows stay quick to tell apart when skimmed by
              // name, then the standing the row actually displays.
              aria-label={`Jump to ${team.shortName}, ${i + 1} of ${ranked.length}, ${metricPhrase(
                sort,
                team,
              )}`}
              className={cn(
                'flex items-center gap-3 rounded px-2 py-2 text-left no-underline transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                team.id === activeTeamId ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30',
              )}
              // `--tw-ring-color`, not `outlineColor` — Tailwind's ring is a box-shadow.
              style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
            >
              <span className="w-5 flex-shrink-0 font-mono text-[11px] text-zinc-400">
                {i + 1}
              </span>
              <TeamMonogramTile team={team} size={22} />
              <span className="w-24 flex-shrink-0 truncate text-xs font-medium text-white">
                {team.shortName}
              </span>

              <span className="h-[9px] min-w-0 flex-1 overflow-hidden bg-zinc-900">
                <span
                  data-testid="bar-fill"
                  className={cn(
                    'block h-full origin-left ease-out',
                    !reducedMotion && 'transition-transform duration-700',
                  )}
                  style={{
                    backgroundColor: team.color,
                    transform: `scaleX(${Number((metric / leader).toFixed(2))})`,
                  }}
                />
              </span>

              <span className="w-10 flex-shrink-0 text-right font-mono text-sm font-bold text-white">
                {reducedMotion ? (
                  sort === 'firstEntry' ? team.firstEntry : metric
                ) : sort === 'firstEntry' ? (
                  team.firstEntry
                ) : (
                  <NumberTicker value={metric} className="text-sm text-white" />
                )}
              </span>
            </motion.a>
          );
        })}
      </div>

      {/* Photograph credits. The page publicly displays 22 driver headshots, 20 of which are
          CC BY or CC BY-SA and so oblige attribution — and because the committed PNGs are
          downscaled and transcoded from the Commons originals, BY-SA's share-alike attaches
          too. `/credits` renders `public/drivers/CREDITS.md` as a real table, thumbnail by
          thumbnail; the raw file stays canonical and is linked from there. A link straight to
          the `.md` did not discharge "provide attribution in any reasonable manner based on the
          medium" — the browser renders it as unstyled text or downloads it. This is the last
          section of /teams, so the link lives here: small, but genuinely visible and keyboard
          reachable. */}
      <footer className="mt-14 border-t border-zinc-900 pt-6">
        <p className="max-w-2xl text-[11px] leading-relaxed text-zinc-400">
          Driver photographs sourced from Wikimedia Commons and used under CC BY / CC BY-SA;
          resized and transcoded from the originals.{' '}
          <a
            href="/credits#driver-photographs"
            className="rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            Full attribution and licence details
          </a>
          .
        </p>
      </footer>
    </section>
  );
}
