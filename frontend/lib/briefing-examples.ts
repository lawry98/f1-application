/**
 * Finding and loading the saved example briefings described in `data/briefing-examples.ts`.
 *
 * The index is statically imported — a few hundred bytes of ids and dates — so matching a failed
 * run to its example is synchronous and needs no backend. The examples themselves are not: each
 * is ~15 kB of prose and evidence, so `loadBriefingExample` reaches for one file through a
 * template-literal import, which the bundler splits into one chunk per example, as
 * `loadCircuit` does for outlines. `tests/briefing-examples.test.ts` fails a static import of one.
 */

import type { BriefingExample, BriefingExampleSummary } from '@/data/briefing-examples';
import index from '@/data/briefing-examples/index.json';
import type { RaceInfo } from '@/types';

export const BRIEFING_EXAMPLES: readonly BriefingExampleSummary[] =
  index as BriefingExampleSummary[];

/**
 * The example "See an example briefing" opens: Monaco, briefed as of its weekend, when there is
 * one. A race already run reads the same however long ago it was captured, which an upcoming
 * race's example — its forecast "not out yet" — does not.
 */
const FEATURED_ID = '2026-06-monaco-grand-prix';

export function exampleById(
  id: string | null,
  catalog: readonly BriefingExampleSummary[] = BRIEFING_EXAMPLES,
): BriefingExampleSummary | null {
  return (id && catalog.find((example) => example.id === id)) || null;
}

/** The example for an event and season, matched exactly — a near name is a different race. */
export function exampleFor(
  event: string,
  year: number,
  catalog: readonly BriefingExampleSummary[] = BRIEFING_EXAMPLES,
): BriefingExampleSummary | null {
  return catalog.find((example) => example.event === event && example.year === year) ?? null;
}

/**
 * The example to offer when a run could not finish.
 *
 * `race_info` names the race exactly when it arrived before the failure — a deadline, a stream
 * error. A refusal or an unreachable backend arrives before it, so the query is all there is:
 * a quick-select chip submits the event's own name, and the year is the calendar's, which is the
 * year the request was made. A typed "Monaco" offers nothing, because it names no event.
 */
export function exampleForFailure(
  raceInfo: RaceInfo | null,
  query: string,
  calendarYear: number,
  catalog: readonly BriefingExampleSummary[] = BRIEFING_EXAMPLES,
): BriefingExampleSummary | null {
  if (raceInfo) return exampleFor(raceInfo.name, raceInfo.year, catalog);
  return exampleFor(query.trim(), calendarYear, catalog);
}

/** The local calendar year a request made at `epochMs` belongs to — the quick-select's year. */
export function calendarYearOf(epochMs: number): number {
  return new Date(epochMs).getFullYear();
}

export function featuredExample(
  catalog: readonly BriefingExampleSummary[] = BRIEFING_EXAMPLES,
): BriefingExampleSummary | null {
  return exampleById(FEATURED_ID, catalog) ?? catalog[0] ?? null;
}

export function exampleHref(id: string): string {
  return `/briefing?example=${encodeURIComponent(id)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `"2026-10-01T17:00:00+00:00"` → `"1 Oct 2026"`, read off the string's own UTC date.
 *
 * Not through `Date` and the reader's zone: a capture at 23:00 UTC is still the 1st, and a page
 * that said "captured 2 Oct" east of Greenwich would contradict the file.
 */
export function formatCapturedDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * One example, as its own chunk, or `null` for an id the index does not list.
 *
 * The id usually comes from the URL, so it is checked against the index before it reaches the
 * import: the template literal would otherwise also resolve `index` itself.
 */
export async function loadBriefingExample(id: string): Promise<BriefingExample | null> {
  if (!exampleById(id)) return null;
  try {
    // Not named `module`: `@next/next/no-assign-module-variable`, as in `loadCircuit`.
    const loaded = await import(`../data/briefing-examples/${id}.json`);
    return (loaded.default ?? loaded) as BriefingExample;
  } catch {
    return null;
  }
}
