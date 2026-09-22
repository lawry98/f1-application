import { TEAMS, TEAM_MAP, type Team } from '@/data/teams-data';
import type { Race } from '@/types';

/**
 * First season `/api/standings` serves — a mirror of `OPENF1_FIRST_YEAR` in
 * `backend/tools/openf1_client.py`, where OpenF1's coverage begins.
 *
 * Mirrored rather than fetched because the season picker needs its range before any request is
 * made, and a range that disagreed with the route would offer a year the route rejects with a
 * 422. `tests/standings.test.ts` reads the backend constant out of its source and fails the
 * moment the two drift.
 */
export const STANDINGS_FIRST_YEAR = 2023;

/** Every season the picker offers, newest first. */
export function standingsYears(latest: number): number[] {
  const years: number[] = [];
  for (let year = latest; year >= STANDINGS_FIRST_YEAR; year -= 1) years.push(year);
  return years;
}

/**
 * The season a `?year=` query asks for, or `latest` when it asks for nothing usable.
 *
 * Validated here, at the edge, so a hand-edited `?year=2019` or `?year=abc` renders the current
 * table rather than sending the route a year it answers with a 422. Next hands a repeated param
 * over as an array; that is treated as unusable rather than guessed at.
 */
export function parseStandingsYear(param: string | string[] | undefined, latest: number): number {
  if (typeof param !== 'string' || !/^\d{4}$/.test(param)) return latest;
  const year = Number(param);
  return year >= STANDINGS_FIRST_YEAR && year <= latest ? year : latest;
}

/**
 * OpenF1 spellings that differ from `Team.shortName` but name the same team.
 *
 * Exact strings, never substrings: the livery fix replaced a `body`/`paint` substring guess that
 * matched nothing and reported nothing, and a `'Bull'` substring here would match two teams.
 * Predecessor brands — `Kick Sauber`, `RB`, `AlphaTauri`, `Alfa Romeo` — are left out on purpose.
 * They are the same entrants as Audi and Racing Bulls, but painting a 2024 row in Audi's colours
 * would misstate who was on the grid, so they render as plain text.
 */
const OPENF1_TEAM_ALIASES: Record<string, string> = {
  'Haas F1 Team': 'haas',
  'Red Bull Racing': 'red-bull',
};

/**
 * The `Team` a standings row's OpenF1 team name refers to, or `null`.
 *
 * `null` is a value the tables render — OpenF1's own spelling as plain text, with no colour bar
 * — not an error. It is the normal case for every season before 2026.
 */
export function teamForStanding(name: string): Team | null {
  const aliased = OPENF1_TEAM_ALIASES[name];
  if (aliased) return TEAM_MAP[aliased] ?? null;
  return TEAMS.find((team) => team.shortName === name) ?? null;
}

/**
 * OpenF1's `full_name` with its uppercased surname returned to title case: `"Kimi ANTONELLI"` →
 * `"Kimi Antonelli"`, matching how `/teams` writes every name.
 *
 * Only fully uppercase tokens of two or more letters change, so a name OpenF1 ever serves in
 * mixed case passes through untouched. Diacritics are already gone upstream (`PEREZ`,
 * `HULKENBERG`) and are not reconstructed.
 */
export function formatDriverName(full: string): string {
  return full
    .split(' ')
    .map((token) =>
      token.length > 1 && token === token.toUpperCase() && token !== token.toLowerCase()
        ? token.charAt(0) + token.slice(1).toLowerCase()
        : token,
    )
    .join(' ');
}

export interface SeasonStamp {
  /** "After Round 14 of 23 · Spanish Grand Prix", or a shorter form when less is known. */
  label: string;
  /** Every round on the calendar has been held — the season is over. */
  final: boolean;
}

/**
 * The as-of line for a season's table — the live counterpart of `STANDINGS_AS_OF`.
 *
 * `racesCompleted` counts races that produced results, and FastF1's calendar drops cancelled
 * events and renumbers the rest, so calendar round `racesCompleted` *is* the last race whose
 * points are in the table. That join is exact only because both halves skip cancellations; the
 * date-based count it replaced pointed two rounds into the future.
 *
 * `null` for a season with no race yet, which the page renders as its own empty state. Without
 * a calendar the label falls back to a bare count, and a count the calendar cannot hold drops the
 * denominator rather than printing "24 of 23". The event is named by `Race.name`, never
 * `location`: FastF1 files the rescheduled 2026 Bahrain Grand Prix under "Kuala Lumpur".
 */
export function seasonStamp(racesCompleted: number, calendar: Race[] | null): SeasonStamp | null {
  if (racesCompleted <= 0) return null;

  const rounds = (calendar ?? []).filter(
    (race) => typeof race.round === 'number' && race.round > 0,
  );
  const total = rounds.length;
  if (total === 0 || racesCompleted > total) {
    return {
      label: `After ${racesCompleted} ${racesCompleted === 1 ? 'round' : 'rounds'}`,
      final: false,
    };
  }

  const event = rounds.find((race) => race.round === racesCompleted);
  return {
    label: event
      ? `After Round ${racesCompleted} of ${total} · ${event.name}`
      : `After ${racesCompleted} of ${total} rounds`,
    final: racesCompleted === total,
  };
}
