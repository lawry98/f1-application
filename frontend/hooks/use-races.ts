'use client';

import { useEffect, useMemo, useState } from 'react';
import { getRaces } from '@/lib/api';
import { localDateOrdinal, parseRaceDate } from '@/lib/race-date';
import type { Race } from '@/types';

/**
 * How many upcoming events the quick-select row shows. Six is what `race-selector.tsx` sliced to
 * before this hook existed, and the row is now a horizontally scrolling strip of ticket cards
 * rather than a wrapping pill list, so the number is a layout decision rather than a data one.
 *
 * **Because it is a layout decision, it does not get to decide what the round join can see.**
 * That is why the slice is exposed as its own field below rather than as *the* list.
 */
const UPCOMING_LIMIT = 6;

export interface UseRacesReturn {
  /**
   * The whole season as the calendar endpoint served it, races already run included. This is what
   * {@link roundFor} joins against.
   */
  races: Race[];
  /**
   * The next {@link UPCOMING_LIMIT} events, soonest first — the quick-select row's view of the
   * same fetch. Empty until the fetch lands.
   */
  upcoming: Race[];
  /** Whether the fetch is still in flight. False after a failure, not only after a success. */
  loading: boolean;
}

/**
 * The season's calendar, fetched once per mount, in two views.
 *
 * **This lifted out of `race-selector.tsx` because two consumers now need the same list, and only
 * one of them is a selector.** `RaceInfo` — the shape the briefing stream emits on `race_info` —
 * carries no `round`, while `Race` does; the spec's adaptation #6 names ROUND as the first row of
 * the circuit band, so the band has to join the resolved race back against this calendar to find
 * it. Leaving the fetch inside the selector and adding a second one for the band would put the
 * same list on the wire twice and let the two copies disagree about what "upcoming" means.
 *
 * **The two views are why `races` and `upcoming` are separate fields.** The selector wants six
 * upcoming events; the round join wants the season. Returning only the slice made ROUND — the
 * band's headline row, the one carrying the red accent — exist *only* when the requested race
 * happened to be among the next six events, which for most of a season it is not. One fetch, no
 * extra wire trip, both views derived from it.
 *
 * The hook deliberately exposes no error state. A failed calendar fetch degrades to an empty
 * quick-select row and a band with no ROUND row — both of which are already the correct rendering
 * for "we do not know", and neither is worth an error banner over a briefing the user can still
 * generate by typing a name. The console error is kept because a silent network failure in
 * development is worse than a noisy one.
 */
export function useRaces(): UseRacesReturn {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read inside the effect, not in render: `new Date()` in a render body is a hydration
    // mismatch waiting for a page that renders either side of midnight on new year's eve.
    const currentYear = new Date().getFullYear();
    // A resolved fetch landing after unmount would set state on a dead component; the flag is
    // cheaper than an AbortController here because nothing else needs to cancel the request.
    let active = true;

    async function fetchRaces(): Promise<void> {
      try {
        const raceData = await getRaces(currentYear);
        if (active) setRaces(raceData);
      } catch (error) {
        console.error('Failed to fetch races:', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchRaces();

    return () => {
      active = false;
    };
  }, []);

  const upcoming = useMemo(() => {
    /*
     * **Compared as calendar days through `parseRaceDate`, never through `new Date(race.date)`.**
     * This line moved here verbatim from the old selector and was the last place in the feature
     * still handing the backend's string to `Date` — the construction the two formatters in
     * `components/briefing/` each carry a paragraph explaining they avoid. The stakes are higher
     * here than in either of them: an `Invalid Date` makes `NaN >= today` false for *every* event,
     * so the quick-select row vanishes and the band's ROUND row with it, silently, with nothing
     * logged. The date-only shape this endpoint serves is the concrete trap — `new Date`
     * interprets it as **UTC** midnight, so west of Greenwich today's race compares as past.
     *
     * An event happening today is still upcoming, so the comparison is `>=` on the day itself
     * rather than on an instant — otherwise a race weekend disappears from the list at midnight
     * on the morning it starts.
     */
    const today = localDateOrdinal(new Date());
    return races
      .filter((race) => {
        const parsed = parseRaceDate(race.date);
        // A row whose date cannot be read is dropped from the *view* only; it stays in `races`,
        // so a round the band could still join is not thrown away over a formatting problem.
        return parsed !== null && parsed.ordinal >= today;
      })
      .slice(0, UPCOMING_LIMIT);
  }, [races]);

  return { races, upcoming, loading };
}

/**
 * The calendar round for a resolved race, or `null` when the calendar does not carry one.
 *
 * Joined on `name` **and `year`** — the stream's `race_info` and the calendar's
 * `/api/races/{year}` both come from the same FastF1 event, so the names match exactly rather
 * than approximately, but a Grand Prix keeps its name for decades and a name match alone says
 * nothing about which season it belongs to. `RaceInfo.year` is on the event the stream resolved,
 * so a typed historical query ("Monaco 1988") cannot pick up this season's round number. The year
 * comes off the calendar row's own date rather than from a field, because `Race` carries none.
 *
 * Two ways this returns `null` that look the same to the band and are not the same bug:
 * a missing round (`Race.round` is `number | null` on the wire), and a round of **0**, which is
 * what `/api/races/{year}` gives pre-season testing. `?? null` lets a real `0` through — `0 ?? null`
 * is `0` — and the band would render `ROUND 00`. Rounds start at 1.
 *
 * Per adaptation #6 the band hides the ROUND row rather than printing a placeholder, so `null` is
 * a value the band renders, not an error.
 */
export function roundFor(races: Race[], raceName: string, year: number): number | null {
  const match = races.find(
    (race) => race.name === raceName && parseRaceDate(race.date)?.year === String(year),
  );
  const round = match?.round;
  return typeof round === 'number' && round > 0 ? round : null;
}
