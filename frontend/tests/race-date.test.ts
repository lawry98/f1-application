/**
 * `lib/race-date.ts` — the one place the backend's space-separated race date is read.
 *
 * Three call sites had grown their own copy of this: `race-selector.tsx` and
 * `briefing-circuit-band.tsx` each hand-rolled a split-and-lookup parser with a near-identical
 * docstring, and `hooks/use-races.ts` skipped the parser entirely and fed the same string to
 * `new Date()` — the exact construction the other two exist to avoid. This suite is written
 * against the shared helper so the argument only has to be defended once.
 *
 * **The point of every case below is that no `Date` is ever constructed from the string.**
 * `new Date("2026-03-08 00:00:00")` is not in the ECMAScript grammar (the spec only guarantees
 * the ISO-8601 `T` form), so it is implementation-defined — V8 and jsdom happen to accept it,
 * and a browser that does not returns `Invalid Date`. The stakes differ per call site and the
 * worst one is the filter in `use-races`: `NaN >= today` is false for *every* event, so the
 * quick-select row and the band's ROUND row both vanish silently, with nothing logged.
 */

import { describe, expect, it } from 'vitest';
import { localDateOrdinal, parseRaceDate } from '@/lib/race-date';

describe('parseRaceDate', () => {
  it('reads the space-separated datetime the briefing stream serves', () => {
    expect(parseRaceDate('2025-05-25 00:00:00')).toEqual({
      year: '2025',
      day: '25',
      monthAbbr: 'MAY',
      ordinal: 20250525,
    });
  });

  it('reads the date-only shape `/api/races/{year}` serves', () => {
    // The calendar endpoint omits the time entirely, so both shapes reach the same parser.
    expect(parseRaceDate('2026-03-08')?.monthAbbr).toBe('MAR');
  });

  it('keeps the day zero-padded rather than handing back a number', () => {
    // `08 MAR` is the register both formatters print in; a numeric day would render `8 MAR`
    // beside `25 MAY` in the same column.
    expect(parseRaceDate('2026-03-08')?.day).toBe('08');
  });

  it('returns null for a string that is not a date at all', () => {
    // The caller drops the row rather than printing the raw value — half-formatted data on a
    // briefing header is worse than one fewer row.
    expect(parseRaceDate('sometime in May')).toBeNull();
  });

  it('returns null for a month outside the table instead of indexing past it', () => {
    expect(parseRaceDate('2025-13-25 00:00:00')).toBeNull();
  });

  it('returns null for an unpadded date rather than guessing', () => {
    // The backend always pads. Accepting `2026-3-8` would mean the strict `race-selector`
    // register (`08 MAR`) and this parser disagreed about what a valid date looks like.
    expect(parseRaceDate('2026-3-8')).toBeNull();
  });

  it('does not normalise an impossible day, which is how it proves it never built a Date', () => {
    // `new Date('2026-02-31')` rolls forward to 3 March. Reading the parts keeps 31 February as
    // 31 February — nonsense in, nonsense out, but never a *different* date printed confidently.
    // This is the assertion that fails the moment someone "simplifies" this back to a `Date`.
    expect(parseRaceDate('2026-02-31')?.ordinal).toBe(20260231);
  });

  it('orders chronologically as a plain number', () => {
    const earlier = parseRaceDate('2026-03-08')!.ordinal;
    const later = parseRaceDate('2026-11-01')!.ordinal;
    const nextYear = parseRaceDate('2027-01-05')!.ordinal;

    expect(earlier).toBeLessThan(later);
    expect(later).toBeLessThan(nextYear);
  });

  it('reports the calendar year as a string, for joining against a RaceInfo year', () => {
    // `roundFor` compares this against `RaceInfo.year` so a 1988 query cannot pick up round 8
    // from this season's calendar.
    expect(parseRaceDate('2026-03-08')?.year).toBe('2026');
  });
});

describe('localDateOrdinal', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // Late-evening local time is already the next day in UTC east of Greenwich and the previous
    // day west of it, so a `toISOString().slice(0, 10)` implementation would report a different
    // day here in most of the world. The date is built with the *local* constructor on purpose.
    expect(localDateOrdinal(new Date(2026, 4, 10, 23, 30))).toBe(20260510);
  });

  it('ignores the time of day entirely, so an event today still compares as upcoming', () => {
    // The rule `use-races` depends on: at 14:30 on race day the event has not passed. Comparing
    // against a timestamp rather than a day would make a race weekend vanish from the row at
    // midnight on the morning it starts.
    const morning = localDateOrdinal(new Date(2026, 4, 10, 0, 0));
    const evening = localDateOrdinal(new Date(2026, 4, 10, 23, 59));

    expect(morning).toBe(evening);
    expect(parseRaceDate('2026-05-10')!.ordinal).toBeGreaterThanOrEqual(evening);
  });
});
