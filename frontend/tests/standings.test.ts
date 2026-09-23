import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TEAMS } from '@/data/teams-data';
import {
  STANDINGS_FIRST_YEAR,
  formatDriverName,
  parseStandingsYear,
  seasonStamp,
  standingsYears,
  teamForStanding,
} from '@/lib/standings';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';

const CALENDAR_2026: Race[] = races2026.races;

function race(round: number, name: string): Race {
  return { name, location: 'Somewhere', country: 'Testland', date: '2023-01-01', round };
}

describe('STANDINGS_FIRST_YEAR', () => {
  it('matches the backend constant the route validates against', () => {
    // The route rejects a year below OPENF1_FIRST_YEAR with a 422, so a picker offering one would
    // offer a page that can only fail. Read out of the Python source rather than retyped here,
    // because a retyped copy drifts exactly as silently as the mirror it is meant to check.
    const source = readFileSync(
      resolve(__dirname, '../../backend/tools/openf1_client.py'),
      'utf8',
    );
    const match = /^OPENF1_FIRST_YEAR = (\d{4})$/m.exec(source);

    expect(match?.[1]).toBe(String(STANDINGS_FIRST_YEAR));
  });
});

describe('standingsYears', () => {
  it('lists every covered season, newest first', () => {
    expect(standingsYears(2026)).toEqual([2026, 2025, 2024, 2023]);
  });
});

describe('parseStandingsYear', () => {
  it.each([
    ['2023', 2023],
    ['2024', 2024],
    ['2026', 2026],
  ])('accepts ?year=%s', (param, year) => {
    expect(parseStandingsYear(param, 2026)).toBe(year);
  });

  it.each([
    ['a year before coverage', '2019'],
    ['a year after the latest', '2027'],
    ['a non-number', 'abc'],
    ['a fraction', '2024.5'],
    ['padding', ' 2024'],
    ['an empty value', ''],
  ])('falls back to the latest season for %s', (_label, param) => {
    expect(parseStandingsYear(param, 2026)).toBe(2026);
  });

  it('falls back for a missing param and for a repeated one', () => {
    expect(parseStandingsYear(undefined, 2026)).toBe(2026);
    // `getAll` of a repeated `?year=` is an array. Guessing which one was meant is worse than
    // showing the default.
    expect(parseStandingsYear(['2024', '2025'], 2026)).toBe(2026);
  });

  it('reads the values `URLSearchParams.getAll` returns', () => {
    // A single `?year=` is a one-element array, and a missing one an empty array.
    expect(parseStandingsYear(['2024'], 2026)).toBe(2024);
    expect(parseStandingsYear([], 2026)).toBe(2026);
  });
});

describe('teamForStanding', () => {
  it('resolves every 2026 constructor, as OpenF1 spells it, to a distinct team', () => {
    // The live payload, not a list typed from memory: "Haas F1 Team" and "Red Bull Racing" are
    // the two an exact shortName match misses. Eleven names resolving to ten teams means the
    // join ate one.
    const names = standings2026.constructors.map((row) => row.team);
    const ids = names.map((name) => teamForStanding(name)?.id);

    expect(names).toHaveLength(11);
    expect(ids).not.toContain(undefined);
    expect(new Set(ids).size).toBe(TEAMS.length);
  });

  it('resolves the two spellings exact matching misses', () => {
    expect(teamForStanding('Haas F1 Team')?.id).toBe('haas');
    expect(teamForStanding('Red Bull Racing')?.id).toBe('red-bull');
  });

  it('leaves predecessor brands unmatched, so 2024 is not painted in 2026 liveries', () => {
    const unmatched = standings2024.constructors
      .map((row) => row.team)
      .filter((name) => teamForStanding(name) === null);

    expect(new Set(unmatched)).toEqual(new Set(['Kick Sauber', 'RB']));
    expect(teamForStanding('AlphaTauri')).toBeNull();
    expect(teamForStanding('Alfa Romeo')).toBeNull();
  });

  it('never matches on a substring or a case variant', () => {
    for (const name of ['Bull', 'Racing', 'Aston', 'mercedes', 'RED BULL RACING']) {
      expect(teamForStanding(name)).toBeNull();
    }
  });
});

describe('formatDriverName', () => {
  it.each([
    ['Kimi ANTONELLI', 'Kimi Antonelli'],
    ['Nico HULKENBERG', 'Nico Hulkenberg'],
    ['Max Verstappen', 'Max Verstappen'],
  ])('%s → %s', (raw, formatted) => {
    expect(formatDriverName(raw)).toBe(formatted);
  });

  it('leaves no shouted surname anywhere in the captured 2026 table', () => {
    for (const row of standings2026.drivers) {
      expect(formatDriverName(row.driver)).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('seasonStamp', () => {
  it('names the last race in the table by its round, mid-season', () => {
    // 14 held races. FastF1 renumbered around the cancelled Bahrain and Saudi Arabia rounds, so
    // Round 14 of 23 is Madrid — a date-based count would have pointed two rounds into the future.
    expect(seasonStamp(standings2026.races_completed, CALENDAR_2026)).toEqual({
      label: 'After Round 14 of 23 · Spanish Grand Prix',
      final: false,
    });
  });

  it('marks a season final when every round is held — 2023, after Imola, is 22 of 22', () => {
    const calendar2023: Race[] = [
      race(0, 'Pre-Season Testing'),
      ...Array.from({ length: 21 }, (_, i) => race(i + 1, `Round ${i + 1} Grand Prix`)),
      race(22, 'Abu Dhabi Grand Prix'),
    ];

    expect(seasonStamp(22, calendar2023)).toEqual({
      label: 'After Round 22 of 22 · Abu Dhabi Grand Prix',
      final: true,
    });
  });

  it('leaves round-0 testing out of the total', () => {
    // FastF1 lists pre-season testing as round 0 — twice in 2026. Counting those would make the
    // season 25 rounds long.
    expect(seasonStamp(1, CALENDAR_2026)?.label).toBe('After Round 1 of 23 · Australian Grand Prix');
  });

  it('falls back to a bare count without a calendar', () => {
    expect(seasonStamp(14, null)).toEqual({ label: 'After 14 rounds', final: false });
    expect(seasonStamp(1, null)).toEqual({ label: 'After 1 round', final: false });
  });

  it('drops the denominator rather than print a count the calendar cannot hold', () => {
    expect(seasonStamp(24, CALENDAR_2026)).toEqual({ label: 'After 24 rounds', final: false });
  });

  it('keeps the denominator when the round itself is missing from the calendar', () => {
    const gappy = CALENDAR_2026.filter((r) => r.round !== 14);

    expect(seasonStamp(14, gappy)).toEqual({ label: 'After 14 of 22 rounds', final: false });
  });

  it('gives no stamp for a season with no race yet', () => {
    expect(seasonStamp(0, CALENDAR_2026)).toBeNull();
  });
});
