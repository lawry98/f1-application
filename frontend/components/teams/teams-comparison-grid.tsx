'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';

import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/utils';
import { ringOnDark } from '@/lib/team-utils';
import { STANDINGS_AS_OF, type Team } from '@/data/teams-data';
import { TeamMonogramTile } from './team-monogram-tile';
import { TeamsCompareTray } from './teams-compare-tray';

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

/**
 * How many constructors the tray compares. Two is the spec's cap and it is a design decision, not
 * a limit of the layout: a head-to-head is the thing that makes this a comparison rather than the
 * ranking the bar race already is.
 */
const COMPARE_SLOTS = 2;

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

  /**
   * The two constructors under comparison, in the order they were picked, so the left column of
   * the tray is the one chosen first.
   *
   * Local state on purpose. The spec forbids new global state, and nothing outside this section
   * needs to know what is being compared — the tray renders inside it and the rows that feed it
   * are its own children.
   */
  const [compared, setCompared] = useState<string[]>([]);

  const toggleCompare = useCallback((id: string) => {
    setCompared((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-COMPARE_SLOTS),
    );
  }, []);

  const clearCompare = useCallback(() => setCompared([]), []);

  // Resolved from `teams` rather than TEAM_MAP so the section compares exactly what it was given.
  const comparedTeams = useMemo(
    () => compared.map((id) => teams.find((t) => t.id === id)).filter((t): t is Team => Boolean(t)),
    [compared, teams],
  );

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
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
          {`Rank by ${SORTS.find((s) => s.key === sort)!.label.toLowerCase()}`}
        </p>
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
          Pick two to compare
        </p>
      </div>

      <div className="flex flex-col">
        {ranked.map((team, i) => {
          const metric = sort === 'firstEntry' ? team.points : team[sort];
          return (
            <motion.div
              key={team.id}
              layout={!reducedMotion}
              transition={
                reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }
              }
              className={cn(
                'flex items-center gap-2 rounded px-2 py-2 transition-colors duration-200',
                team.id === activeTeamId ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30',
              )}
            >
              <a
                href={`#team-${team.id}`}
                onClick={() => onSelectTeam(team.id)}
                // Team name first, so the eleven rows stay quick to tell apart when skimmed by
                // name, then the standing the row actually displays.
                aria-label={`Jump to ${team.shortName}, ${i + 1} of ${
                  ranked.length
                }, ${metricPhrase(sort, team)}`}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 text-left no-underline',
                  'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
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
              </a>

              {/* A sibling of the anchor, never a child of it: a button inside an anchor is
                  invalid HTML and what a browser does on click is undefined. */}
              <button
                type="button"
                onClick={() => toggleCompare(team.id)}
                aria-pressed={compared.includes(team.id)}
                aria-label={`Compare ${team.shortName}`}
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border transition-colors duration-200 active:scale-[0.96]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                  compared.includes(team.id)
                    ? 'border-zinc-500 bg-zinc-800 text-white'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200',
                )}
                style={{ '--tw-ring-color': ringOnDark(team.color) } as React.CSSProperties}
              >
                {compared.includes(team.id) ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <Plus size={12} aria-hidden="true" />
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/*
        Plain `AnimatePresence`, no `mode="wait"`. The incoming child under `mode="wait"` is held
        behind the outgoing one's exit animation, which never resolves synchronously in jsdom, so
        every assertion in this section's tests would find nothing. The swap here is between "no
        tray" and "a tray", which nothing is waiting on anyway.
      */}
      <AnimatePresence initial={false}>
        {comparedTeams.length === COMPARE_SLOTS && (
          <TeamsCompareTray
            key="compare-tray"
            teams={[comparedTeams[0]!, comparedTeams[1]!]}
            reducedMotion={reducedMotion}
            onClear={clearCompare}
          />
        )}
      </AnimatePresence>

      {compared.length === 1 && (
        <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          Select one more constructor to compare
        </p>
      )}

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
