/**
 * Reading the backend's race date without ever constructing a `Date` from it.
 *
 * **`RaceInfo.date` and `Race.date` are space-separated, not ISO-T** — `"2026-03-08 00:00:00"`
 * from the briefing stream, `"2026-03-08"` from `/api/races/{year}`. `new Date()` on the first
 * form parses in V8 and in jsdom but is *not* in the ECMAScript grammar: it is
 * implementation-defined, and a browser that declines it returns `Invalid Date`. The second form
 * is spec'd, but as **UTC** midnight, so a browser west of Greenwich renders 8 March as 07 MAR.
 * Both failures print or hide a fact the user reads as true, and neither raises anything.
 *
 * This file exists because three call sites in one feature had each answered that separately.
 * `race-selector.tsx` and `briefing-circuit-band.tsx` had grown near-identical hand-rolled
 * parsers with near-identical docstrings arguing the same point, and `hooks/use-races.ts` — whose
 * comparison decides whether the quick-select row and the band's ROUND row exist at all — was
 * still feeding the raw string to `new Date()`. At n=3 the argument is worth making once. Per
 * `CLAUDE.md` this is a plain helper rather than a hook, so it lives in `lib/`.
 *
 * There is deliberately **no date library**. Everything the feature needs is a three-part split,
 * a month lookup and an integer comparison.
 */

/**
 * Month abbreviations, indexed by `month - 1`, in the mono-caps register the whole feature's
 * labels use.
 *
 * Hand-rolled rather than `toLocaleString('en', { month: 'short' })`, which is locale- and
 * ICU-version-dependent: the same card would read `MAR` for one user and `mars` for another
 * inside a row whose surrounding labels stayed English, and jsdom's ICU build is not guaranteed
 * to agree with the browser's. Not exported — a caller that wants a month name wants
 * {@link parseRaceDate}, which is the only thing that can tell it whether the month was real.
 */
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** A race date, decomposed into the parts the feature actually prints and compares. */
export interface RaceDate {
  /** The calendar year, as written: `"2026"`. */
  year: string;
  /** The day, **zero-padded as the backend serves it**: `"08"`, so `08 MAR` lines up with `25 MAY`. */
  day: string;
  /** The month in mono caps: `"MAR"`. */
  monthAbbr: string;
  /**
   * `yyyymmdd` as an integer — `20260308` — so two dates can be ordered, or compared against
   * today, without a `Date` and without a timezone entering the question.
   */
  ordinal: number;
}

/**
 * The shape the backend serves, and nothing looser.
 *
 * Anchored and fully padded on purpose: accepting `2026-3-8` would mean this parser and the
 * `08 MAR` register it feeds disagreed about what a valid date looks like. The month is *not*
 * range-checked here — `MONTHS` lookup below is what rejects a nonsense month, and doing it in
 * one place keeps the pattern readable.
 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `"2026-03-08 00:00:00"` → its parts, or `null` for anything this cannot read.
 *
 * Null rather than a raw-string fallback, because every caller's correct rendering for "we could
 * not read this" is to omit the row: a half-formatted date on a briefing header is worse than one
 * fewer row, and a chip with no date is still a usable control.
 */
export function parseRaceDate(raw: string): RaceDate | null {
  const match = DATE_PATTERN.exec(raw.split(' ')[0] ?? '');
  if (!match) return null;

  // Destructured with defaults rather than `!`: under `noUncheckedIndexedAccess` a regex group is
  // `string | undefined`, and a default cannot lie about a missing value the way an assertion can.
  // They are unreachable — the pattern has three mandatory groups.
  const [, year = '', month = '', day = ''] = match;
  const monthAbbr = MONTHS[Number(month) - 1];
  if (!monthAbbr) return null;

  return {
    year,
    day,
    monthAbbr,
    // Concatenated from the digits rather than computed from a `Date`, which is what keeps an
    // impossible date impossible instead of silently rolling it forward: `new Date('2026-02-31')`
    // is 3 March, this is 20260231.
    ordinal: Number(`${year}${month}${day}`),
  };
}

/**
 * The same `yyyymmdd` integer for a moment in the **local** calendar, so "has this race passed?"
 * is a comparison between two days rather than between two instants.
 *
 * The time of day is dropped entirely, which is the rule the quick-select row depends on: an
 * event happening *today* is still upcoming. Comparing against a timestamp would make a race
 * weekend disappear from the row at midnight on the morning it starts.
 *
 * Local components rather than `toISOString().slice(0, 10)`: late evening is already tomorrow in
 * UTC east of Greenwich and still yesterday west of it, so the ISO form would answer with a day
 * the user is not living in.
 */
export function localDateOrdinal(now: Date): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}
