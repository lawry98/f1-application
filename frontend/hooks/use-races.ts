'use client';

import { useEffect, useState } from 'react';
import { getRaces } from '@/lib/api';
import type { Race } from '@/types';

/**
 * How many upcoming events the quick-select row shows. Six is what `race-selector.tsx` sliced to
 * before this hook existed, and the row is now a horizontally scrolling strip of ticket cards
 * rather than a wrapping pill list, so the number is a layout decision rather than a data one.
 */
const UPCOMING_LIMIT = 6;

export interface UseRacesReturn {
  /** The next {@link UPCOMING_LIMIT} events, soonest first. Empty until the fetch lands. */
  races: Race[];
  /** Whether the fetch is still in flight. False after a failure, not only after a success. */
  loading: boolean;
}

/**
 * The season's upcoming races, fetched once per mount.
 *
 * **This lifted out of `race-selector.tsx` because two consumers now need the same list, and only
 * one of them is a selector.** `RaceInfo` — the shape the briefing stream emits on `race_info` —
 * carries no `round`, while `Race` does; the spec's adaptation #6 names ROUND as the first row of
 * the circuit band, so the band has to join the resolved race back against this calendar to find
 * it. Leaving the fetch inside the selector and adding a second one for the band would put the
 * same list on the wire twice and let the two copies disagree about what "upcoming" means.
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
        // An event happening today is still upcoming, so compare against the start of today
        // rather than against now — otherwise a race weekend disappears from the list at
        // midnight on the day it starts.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = raceData
          .filter((race) => new Date(race.date) >= today)
          .slice(0, UPCOMING_LIMIT);
        if (active) setRaces(upcoming);
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

  return { races, loading };
}

/**
 * The calendar round for a resolved race, or `null` when the set does not carry it.
 *
 * Joined on `name` because that is the only field the two shapes share verbatim — the stream's
 * `race_info` and the calendar's `/api/races/{year}` both come from the same FastF1 event, so the
 * names match exactly rather than approximately. A null result is the normal case for a typed
 * historical query ("Monaco 1988"), and per adaptation #6 the band hides the ROUND row rather than
 * printing a placeholder.
 */
export function roundFor(races: Race[], raceName: string): number | null {
  return races.find((race) => race.name === raceName)?.round ?? null;
}
