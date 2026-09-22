'use client';

import { useCallback, useEffect, useState } from 'react';

import { getRaces, getStandings } from '@/lib/api';
import type { Race, StandingsResponse } from '@/types';

export interface UseStandingsReturn {
  /** The requested season's tables, or `null` while loading or after a failure. */
  standings: StandingsResponse | null;
  /**
   * That season's calendar, or `null` when it failed or has not landed. It only ever enriches the
   * as-of stamp, so a failure here is logged and degrades the stamp to a bare count.
   */
  calendar: Race[] | null;
  /** True until this season's result lands — including straight after a season change. */
  loading: boolean;
  /** The standings fetch failed. The calendar failing never sets this. */
  error: boolean;
  /** Fetch the current season again. */
  retry: () => void;
}

interface Loaded {
  year: number;
  standings: StandingsResponse | null;
  calendar: Race[] | null;
  error: boolean;
}

/**
 * One season's championship tables and its calendar, fetched together.
 *
 * **Same shape as `use-races.ts`** — state, one effect, an `active` flag — **with one deliberate
 * difference: this hook exposes an error.** A failed calendar degrades `use-races`' consumers to
 * renderings that were already correct for "we do not know"; here the table *is* the page, so
 * the page has to be able to say it failed and offer a retry.
 *
 * Both requests go out together through `Promise.allSettled`, so the stamp arrives complete
 * instead of reading "After 14 rounds" and then shifting to the full label. On a season change
 * the previous effect's `active` flag drops its response even if it lands last, and a result is
 * only reported for the year it was fetched for — so the previous season's tables never render
 * under the new season's heading.
 */
export function useStandings(year: number): UseStandingsReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      const [standings, calendar] = await Promise.allSettled([
        getStandings(year),
        getRaces(year),
      ]);
      if (!active) return;

      // Kept for the same reason `use-races` keeps its log: a silent network failure in
      // development is worse than a noisy one.
      if (standings.status === 'rejected') {
        console.error('Failed to fetch standings:', standings.reason);
      }
      if (calendar.status === 'rejected') {
        console.error('Failed to fetch the calendar:', calendar.reason);
      }

      setLoaded({
        year,
        standings: standings.status === 'fulfilled' ? standings.value : null,
        calendar: calendar.status === 'fulfilled' ? calendar.value : null,
        error: standings.status === 'rejected',
      });
    }

    void load();

    return () => {
      active = false;
    };
  }, [year, attempt]);

  const retry = useCallback(() => {
    // Cleared first so the page reads "loading" immediately rather than showing the error until
    // the new response lands.
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.year === year ? loaded : null;
  return {
    standings: current?.standings ?? null,
    calendar: current?.calendar ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
