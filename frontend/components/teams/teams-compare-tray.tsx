'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/utils';
import { focusRing } from '@/lib/focus';
import { trayValueColor } from '@/lib/team-utils';
import { type Team } from '@/data/teams-data';
import { TeamMonogramTile } from './team-monogram-tile';

export interface CompareField {
  label: string;
  /** What one team shows for this field. */
  value: (team: Team) => string;
  /**
   * Higher-is-better score for this field, or `null` when nothing can lead it.
   *
   * `null` is not "not implemented yet" — it is the spec's rule that non-numeric rows get no
   * highlight. Nothing wins a power unit, a base or a driver pairing, and inventing an ordering
   * for them would turn a comparison back into the ranking the bar race already is.
   */
  lead: ((team: Team) => number) | null;
}

/**
 * The six fields the spec names, in its order.
 *
 * `First Entry` is negated because the leader is the *earlier* debut — the same direction the
 * "Since" sort tab already uses, which sorts ascending with the oldest constructor first. Scoring
 * the raw year would hand 1950 Ferrari's row to whichever team is youngest.
 */
export const COMPARE_FIELDS: CompareField[] = [
  {
    label: 'Championship',
    value: (t) => `P${t.position} · ${t.points} PTS`,
    lead: (t) => t.points,
  },
  {
    label: 'Titles',
    value: (t) => (t.championships > 0 ? `${t.championships} WCC` : '—'),
    lead: (t) => t.championships,
  },
  { label: 'Power Unit', value: (t) => t.powerUnit, lead: null },
  { label: 'Base', value: (t) => t.base, lead: null },
  { label: 'First Entry', value: (t) => String(t.firstEntry), lead: (t) => -t.firstEntry },
  { label: 'Drivers', value: (t) => t.drivers.map((d) => d.name).join(' · '), lead: null },
];

/**
 * Which of the two teams leads a field: `0`, `1`, or `null`.
 *
 * `null` covers both "nothing can lead this" and "they are level". A tie is a real case on this
 * grid rather than a defensive branch — Cadillac and Audi are both on zero championships — and
 * highlighting one of two equal values is worse than highlighting neither.
 */
export function leaderIndex(field: CompareField, a: Team, b: Team): 0 | 1 | null {
  if (!field.lead) return null;
  const scoreA = field.lead(a);
  const scoreB = field.lead(b);
  if (scoreA === scoreB) return null;
  return scoreA > scoreB ? 0 : 1;
}

/** `Power Unit` → `power-unit`, for the row's test id. */
function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

interface TeamsCompareTrayProps {
  teams: [Team, Team];
  reducedMotion: boolean;
  onClear: () => void;
}

/**
 * Two constructors laid out field by field.
 *
 * A pure function of its two teams: it holds no state, does no selection and knows nothing about
 * the bar race that feeds it. Everything about *which* two teams is the grid's business.
 *
 * The layout is one DOM at both breakpoints, not two rendered sets. At `lg` and up each field is a
 * three-cell row — value, label, value — with the label centred between the two columns; below
 * `lg` the same three cells stack, label first, and each value carries an `lg:hidden` copy of its
 * team's name so a stacked value still says whose it is. Rendering a second `lg:hidden` tray
 * instead would put two of every field in the DOM under jsdom, where no media query applies, and
 * every `getByText` here would throw on multiple matches.
 */
export function TeamsCompareTray({
  teams: [left, right],
  reducedMotion,
  onClear,
}: TeamsCompareTrayProps) {
  const columns: [Team, Team] = [left, right];

  return (
    <motion.section
      data-testid="compare-tray"
      aria-label={`${left.shortName} compared with ${right.shortName}`}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
      className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5"
    >
      {/* Column headers. The accent rule under each is decorative and keeps the true livery. */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="hidden flex-1 gap-6 lg:flex">
          {columns.map((team, i) => (
            <div key={team.id} className={cn('flex-1', i === 0 && 'text-right')}>
              <div className={cn('flex items-center gap-2', i === 0 && 'flex-row-reverse')}>
                <TeamMonogramTile team={team} size={20} />
                <span className="truncate text-sm font-bold uppercase tracking-wider text-white">
                  {team.shortName}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="mt-2 block h-[2px] w-full"
                style={{ backgroundColor: team.color }}
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 lg:hidden">
          Head to head
        </p>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear comparison"
          // Flush red, no offset: the tray is `bg-zinc-900/60`, which composites to `#121215` —
          // not a token an offset band could name. Red measures 3.76:1 there, over the 3:1
          // non-text bar. See `lib/focus.ts` for the whole rule.
          className={cn(
            'flex-shrink-0 rounded border border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400 transition-colors duration-200 hover:text-zinc-200 active:scale-[0.96]',
            focusRing,
          )}
        >
          Clear
        </button>
      </div>

      <dl className="flex flex-col">
        {COMPARE_FIELDS.map((f) => {
          const leader = leaderIndex(f, left, right);
          return (
            <div
              key={f.label}
              data-testid={`compare-row-${slug(f.label)}`}
              className="flex flex-col gap-1 border-t border-zinc-800 py-3 lg:flex-row lg:items-center lg:gap-6"
            >
              <dt className="order-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400 lg:order-2 lg:w-32 lg:flex-shrink-0 lg:text-center">
                {f.label}
              </dt>
              {columns.map((team, i) => (
                <dd
                  key={team.id}
                  data-testid={`compare-value-${i}`}
                  className={cn(
                    'font-mono text-sm tabular-nums lg:flex-1',
                    i === 0 ? 'order-2 lg:order-1 lg:text-right' : 'order-3 lg:order-3',
                    leader === i ? 'font-semibold' : 'font-normal text-zinc-200',
                  )}
                  style={leader === i ? { color: trayValueColor(team.color) } : undefined}
                >
                  {/* Mobile stacked label: proportional, not the mono the value adopts below. */}
                  <span className="mr-2 font-sans text-[10px] uppercase tracking-[0.15em] text-zinc-400 lg:hidden">
                    {team.shortName}
                  </span>
                  {f.value(team)}
                  {leader === i && <span className="sr-only"> — leads</span>}
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
    </motion.section>
  );
}
