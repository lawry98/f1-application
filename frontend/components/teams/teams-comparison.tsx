'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';

import { TextAnimate } from '@/components/ui/text-animate';
import { paletteFor, withAlpha } from '@/lib/team-utils';
import { cn } from '@/lib/utils';
import { SEASON, type Team } from '@/data/teams-data';
import { teamSectionId } from '@/hooks/use-team-navigation';

const MAX_COMPARE = 3;

interface Metric {
  id: string;
  label: string;
  /** Short unit shown next to the value. */
  caption: (team: Team) => string;
  value: (team: Team, teams: Team[]) => number;
  format: (team: Team, teams: Team[]) => string;
  /** Lower is better — sorts ascending and ranks 1 to the smallest value. */
  ascending?: boolean;
  /** Whether the dataset can support this metric at all. */
  available: (teams: Team[]) => boolean;
}

const seasonsOnGrid = (team: Team) => SEASON - team.firstEntry + 1;
const supplierCount = (team: Team, teams: Team[]) =>
  teams.filter((t) => t.powerUnit === team.powerUnit).length;

const METRICS: Metric[] = [
  {
    id: 'titles',
    label: "Constructors' titles",
    caption: () => 'titles',
    value: (team) => team.championships,
    format: (team) => String(team.championships),
    available: () => true,
  },
  {
    id: 'seasons',
    label: 'Seasons on the grid',
    caption: (team) => `since ${team.firstEntry}`,
    value: seasonsOnGrid,
    format: (team) => String(seasonsOnGrid(team)),
    available: () => true,
  },
  {
    id: 'power-unit',
    label: 'Power unit share',
    caption: (team) => team.powerUnit,
    value: supplierCount,
    format: (team, teams) => `${supplierCount(team, teams)}×`,
    available: () => true,
  },
  {
    id: 'position',
    label: `${SEASON} standing`,
    caption: () => 'position',
    value: (team) => team.championshipPosition ?? Number.MAX_SAFE_INTEGER,
    format: (team) =>
      team.championshipPosition === undefined ? '—' : `P${team.championshipPosition}`,
    ascending: true,
    available: (teams) => teams.some((t) => t.championshipPosition !== undefined),
  },
  {
    id: 'points',
    label: `${SEASON} points`,
    caption: () => 'pts',
    value: (team) => team.points ?? 0,
    format: (team) => (team.points === undefined ? '—' : String(team.points)),
    available: (teams) => teams.some((t) => t.points !== undefined),
  },
];

interface TeamsComparisonProps {
  teams: Team[];
  activeTeamId: string;
  reducedMotion: boolean;
  onSelectTeam: (teamId: string) => void;
}

/**
 * The closing section: the whole grid on one axis at a time, plus a head-to-head for up to three
 * teams. Deliberately not eleven more team cards — the sections above already did that; this is
 * the view you cannot get by scrolling.
 */
export function TeamsComparison({
  teams,
  activeTeamId,
  reducedMotion,
  onSelectTeam,
}: TeamsComparisonProps) {
  const metrics = useMemo(() => METRICS.filter((m) => m.available(teams)), [teams]);
  const [metricId, setMetricId] = useState(metrics[0]!.id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0]!;

  const ranked = useMemo(() => {
    const rows = teams.map((team) => ({ team, value: metric.value(team, teams) }));
    rows.sort((a, b) => (metric.ascending ? a.value - b.value : b.value - a.value));
    const max = Math.max(...rows.map((r) => (metric.ascending ? 1 : r.value)), 1);
    return rows.map((row, i) => ({
      ...row,
      rank: i + 1,
      // Ascending metrics (a standings position) have no meaningful magnitude, so their bars
      // encode rank instead of value.
      fraction: metric.ascending ? (rows.length - i) / rows.length : max > 0 ? row.value / max : 0,
    }));
  }, [teams, metric]);

  const selected = selectedIds
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is Team => t !== undefined);

  const toggleCompare = (teamId: string) =>
    setSelectedIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId].slice(-MAX_COMPARE),
    );

  return (
    <section
      id="grid-comparison"
      aria-labelledby="grid-comparison-title"
      className="relative scroll-mt-[6.5rem] overflow-hidden bg-zinc-950 px-6 py-24 lg:scroll-mt-16 lg:px-10"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-zinc-900" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-0 h-[32rem] w-[32rem] rounded-full opacity-[0.07]"
        style={{ background: '#dc2626', filter: 'blur(140px)' }}
      />

      <div className="relative z-10 mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-500">Head to head</p>
          <h2 id="grid-comparison-title" className="sr-only">
            Compare the grid
          </h2>
          <div aria-hidden="true">
            <TextAnimate
              accessible={false}
              animation={reducedMotion ? 'fadeIn' : 'slideUp'}
              by="word"
              startOnView
              once
              className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl"
            >
              Compare the grid
            </TextAnimate>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Rank all {teams.length} constructors on one measure at a time, then pin up to{' '}
            {MAX_COMPARE} of them side by side.
          </p>
        </header>

        {/* Metric switcher */}
        <div
          role="group"
          aria-label="Ranking measure"
          className="mb-8 flex flex-wrap gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1.5"
        >
          {metrics.map((m) => {
            const isActive = m.id === metric.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setMetricId(m.id)}
                className={cn(
                  'relative rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="comparison-metric-pill"
                    className="absolute inset-0 rounded-lg bg-zinc-800"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 36 }
                    }
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Ranking */}
        <ol className="space-y-1.5">
          {ranked.map(({ team, rank, fraction }, i) => {
            const palette = paletteFor(team.color);
            const isSelected = selectedIds.includes(team.id);
            const isActive = team.id === activeTeamId;

            return (
              <motion.li
                key={team.id}
                layout={!reducedMotion}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={
                  reducedMotion
                    ? { duration: 0.2 }
                    : {
                        layout: { type: 'spring', stiffness: 380, damping: 40 },
                        duration: 0.45,
                        delay: Math.min(i * 0.035, 0.35),
                      }
                }
                className="group relative overflow-hidden rounded-lg border bg-zinc-900/30 transition-colors duration-300 hover:bg-zinc-900/60"
                style={{
                  borderColor: isActive ? palette.border : 'rgb(39 39 42 / 0.8)',
                }}
              >
                {/* Magnitude bar, drawn behind the row content */}
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  initial={false}
                  animate={{ width: `${Math.max(fraction * 100, 2)}%` }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 160, damping: 28 }
                  }
                  style={{
                    background: `linear-gradient(90deg, ${withAlpha(team.color, 0.34)}, ${withAlpha(team.color, 0.06)})`,
                    borderRight: `2px solid ${withAlpha(team.color, 0.75)}`,
                  }}
                />

                <div className="relative z-10 flex items-center gap-3 px-3 py-2.5">
                  <span className="w-6 flex-shrink-0 font-mono text-xs text-zinc-500">
                    <span className="sr-only">Rank </span>
                    {String(rank).padStart(2, '0')}
                  </span>

                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />

                  <a
                    href={`#${teamSectionId(team.id)}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      onSelectTeam(team.id);
                    }}
                    className="min-w-0 flex-1 rounded text-sm font-bold uppercase tracking-wide text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    style={{ ['--tw-ring-color' as string]: palette.ring }}
                  >
                    <span className="truncate">{team.shortName}</span>
                  </a>

                  <span className="hidden font-mono text-[10px] tracking-widest text-zinc-500 sm:inline">
                    {team.drivers.map((d) => d.shortCode).join(' · ')}
                  </span>

                  <span className="flex-shrink-0 text-right">
                    <span
                      className="text-sm font-black tabular-nums"
                      style={{ color: palette.display }}
                    >
                      {metric.format(team, teams)}
                    </span>
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      {metric.caption(team)}
                    </span>
                  </span>

                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`Compare ${team.shortName}`}
                    onClick={() => toggleCompare(team.id)}
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                      isSelected
                        ? 'text-white'
                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200',
                    )}
                    style={{
                      ['--tw-ring-color' as string]: palette.ring,
                      ...(isSelected
                        ? {
                            backgroundColor: team.color,
                            borderColor: team.color,
                            color: palette.on,
                          }
                        : {}),
                    }}
                  >
                    {isSelected ? <Check size={13} /> : <Plus size={13} />}
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ol>

        {/* Head to head */}
        {/* No AnimatePresence: `mode="wait"` would hold the table back behind an exit animation,
            and this swap reads better as a direct replacement anyway. */}
        <div aria-live="polite" className="mt-10">
          {selected.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-xs uppercase tracking-widest text-zinc-600">
              {`Pick up to ${MAX_COMPARE} constructors above to compare them side by side`}
            </p>
          ) : (
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0.15 : 0.35, ease: 'easeOut' }}
              className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/30"
            >
              <HeadToHeadTable teams={selected} reducedMotion={reducedMotion} />
            </motion.div>
          )}
        </div>

        <p className="mt-10 text-center text-xs uppercase tracking-widest text-zinc-600">
          {`${SEASON} FIA Formula One World Championship`}
        </p>
      </div>
    </section>
  );
}

interface Row {
  label: string;
  render: (team: Team) => React.ReactNode;
  /** Rows nobody in the comparison has data for are dropped rather than shown as a column of dashes. */
  available?: (teams: Team[]) => boolean;
}

const ROWS: Row[] = [
  {
    label: `${SEASON} standing`,
    render: (team) => `P${team.championshipPosition}`,
    available: (teams) => teams.some((t) => t.championshipPosition !== undefined),
  },
  {
    label: `${SEASON} points`,
    render: (team) => (team.points === undefined ? '—' : `${team.points} pts`),
    available: (teams) => teams.some((t) => t.points !== undefined),
  },
  { label: "Constructors' titles", render: (team) => team.championships || '—' },
  { label: 'First entry', render: (team) => team.firstEntry },
  { label: 'Seasons on the grid', render: (team) => seasonsOnGrid(team) },
  { label: 'Power unit', render: (team) => team.powerUnit },
  { label: 'Base', render: (team) => team.base },
  {
    label: 'Drivers',
    render: (team) => (
      <span className="block space-y-0.5">
        {team.drivers.map((driver) => (
          <span key={driver.id} className="block">
            {`#${driver.number} ${driver.name}`}
          </span>
        ))}
      </span>
    ),
  },
];

function HeadToHeadTable({ teams, reducedMotion }: { teams: Team[]; reducedMotion: boolean }) {
  const rows = ROWS.filter((row) => row.available?.(teams) ?? true);

  return (
    <table className="w-full min-w-[30rem] border-collapse text-left">
      <caption className="sr-only">
        Side-by-side comparison of {teams.map((t) => t.name).join(', ')}
      </caption>
      <thead>
        <tr>
          <th scope="col" className="w-40 px-4 py-3">
            <span className="sr-only">Attribute</span>
          </th>
          {teams.map((team, i) => {
            const palette = paletteFor(team.color);
            return (
              <th key={team.id} scope="col" className="px-4 py-3 align-bottom">
                <motion.span
                  className="block"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0.15 : 0.35, delay: i * 0.06 }}
                >
                  <span
                    aria-hidden="true"
                    className="mb-2 block h-1 w-full rounded-full"
                    style={{
                      backgroundColor: team.color,
                      boxShadow: `0 0 16px ${withAlpha(team.color, 0.6)}`,
                    }}
                  />
                  <span
                    className="block text-sm font-black uppercase tracking-tight"
                    style={{ color: palette.display }}
                  >
                    {team.shortName}
                  </span>
                </motion.span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-zinc-800/70">
            <th
              scope="row"
              className="px-4 py-2.5 align-top text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500"
            >
              {row.label}
            </th>
            {teams.map((team) => (
              <td key={team.id} className="px-4 py-2.5 align-top text-sm text-zinc-200">
                {row.render(team)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
