import type { ReactNode } from 'react';

import { type Team } from '@/data/teams-data';
import { formatDriverName, teamForStanding } from '@/lib/standings';
import { cn } from '@/lib/utils';
import type { ConstructorStanding, DriverStanding } from '@/types';

/**
 * The two championship tables on `/standings`.
 *
 * Presentation only, like `attribution-table.tsx`: rows in, markup out. Rows render in the order
 * they arrive and are never sorted — the backend breaks ties on best finish and then car number
 * precisely so that two reads of the table agree, and a client-side sort would undo that.
 *
 * **Team colour is decorative here, never text.** Each row carries a 4px bar in the team's true
 * hex — bars are exempt from the text-contrast rule and must keep the real colour, per
 * `readableOnDark` — and every glyph is a zinc neutral on the bare `zinc-950` page: no zebra
 * stripes, no hover tint, no highlighted leader. That is the whole reason this file calls no
 * `lib/team-utils.ts` helper. A livery on text, or any fill behind a row, needs its own backdrop
 * variant built from `blendOver` + `liftUntilContrast` first, and
 * `tests/standings-tables.test.tsx` fails until it has one.
 */

/** Small-caps tracked label, as `/credits` uses for its table headers. */
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
/** A rule above each body row and no fill, so the backdrop behind every glyph stays `zinc-950`. */
const CELL = 'border-t border-zinc-800 py-2.5 align-middle';
const POSITION = cn(CELL, 'w-10 pr-2 font-mono text-xs tabular-nums text-zinc-400');
const POINTS = cn(CELL, 'w-16 text-right font-semibold tabular-nums');

/** At most one decimal: `292`, and `12.5` for a half-points race should one ever be served. */
const formatPoints = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;

/**
 * The team's colour bar, or an empty slot of the same width for a team `TEAMS` does not know,
 * so the names beside it still line up. `aria-hidden`: the team name carries the meaning, which
 * is also why the bar is not held to WCAG's non-text contrast bar.
 */
function TeamBar({ team }: { team: Team | null }) {
  return (
    <span
      aria-hidden="true"
      data-team-bar={team?.id ?? 'unmatched'}
      className="h-6 w-1 flex-shrink-0 rounded-full"
      style={team ? { backgroundColor: team.color } : undefined}
    />
  );
}

interface StandingsTableProps {
  caption: string;
  subjectLabel: string;
  children: ReactNode;
}

/** The shared shell. `text-zinc-200` here is what every body cell inherits. */
function StandingsTable({ caption, subjectLabel, children }: StandingsTableProps) {
  return (
    <table className="w-full border-collapse text-left text-sm text-zinc-200">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(LABEL, 'w-10 pb-2 pr-2')}>
            <span aria-hidden="true">Pos</span>
            <span className="sr-only">Position</span>
          </th>
          <th scope="col" className={cn(LABEL, 'pb-2')}>
            {subjectLabel}
          </th>
          <th scope="col" className={cn(LABEL, 'w-16 pb-2 text-right')}>
            <span aria-hidden="true">Pts</span>
            <span className="sr-only">Points</span>
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function DriverStandingsTable({ rows }: { rows: DriverStanding[] }) {
  return (
    <StandingsTable
      caption="Drivers' championship: position, driver and team, points."
      subjectLabel="Driver"
    >
      {rows.map((row) => {
        const team = teamForStanding(row.team);
        return (
          <tr key={row.position}>
            <td className={POSITION}>{row.position}</td>
            <td className={CELL}>
              {/* The team is a second line rather than a fourth column, so 390px needs no hidden
                  column and no horizontal scroll. */}
              <span className="flex items-center gap-3">
                <TeamBar team={team} />
                <span className="min-w-0">
                  <span className="block">{formatDriverName(row.driver)}</span>
                  <span className="block text-xs text-zinc-400">{team?.shortName ?? row.team}</span>
                </span>
              </span>
            </td>
            <td className={POINTS}>{formatPoints(row.points)}</td>
          </tr>
        );
      })}
    </StandingsTable>
  );
}

export function ConstructorStandingsTable({ rows }: { rows: ConstructorStanding[] }) {
  return (
    <StandingsTable caption="Constructors' championship: position, team, points." subjectLabel="Team">
      {rows.map((row) => {
        const team = teamForStanding(row.team);
        return (
          <tr key={row.position}>
            <td className={POSITION}>{row.position}</td>
            <td className={CELL}>
              <span className="flex items-center gap-3">
                <TeamBar team={team} />
                <span className="min-w-0">{team?.shortName ?? row.team}</span>
              </span>
            </td>
            <td className={POINTS}>{formatPoints(row.points)}</td>
          </tr>
        );
      })}
    </StandingsTable>
  );
}
