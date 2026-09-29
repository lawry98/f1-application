'use client';

import { useCallback, useEffect, useState } from 'react';

import { getRaces } from '@/lib/api';
import {
  canonicalSlug,
  loadCircuit,
  resolveCircuitId,
  type CircuitGeometry,
} from '@/lib/circuit-geometry';
import type { Race } from '@/types';

/** One round of a season, with the outline to draw for it. */
export interface SeasonCircuit {
  race: Race;
  /** Null for a location the vendored set has no outline for — the card still renders. */
  geometry: CircuitGeometry | null;
  /** The detail page's slug; null exactly when `geometry` is, since there is no page to link. */
  slug: string | null;
}

export interface UseSeasonCircuitsReturn {
  /** Every round in calendar order, or `null` while loading or after a failure. */
  circuits: SeasonCircuit[] | null;
  loading: boolean;
  /** The calendar fetch failed. A missing outline is never an error. */
  error: boolean;
  retry: () => void;
}

interface Loaded {
  year: number;
  circuits: SeasonCircuit[] | null;
  error: boolean;
}

/**
 * A season's calendar and every outline it needs, fetched together.
 *
 * **Same shape as `use-standings.ts`** — state, one effect, an `active` flag, a result only
 * reported for the year it was fetched for, and a retry that clears to loading first.
 *
 * **Outlines load once per circuit and land together.** Each id is one lazy chunk through
 * `loadCircuit` (~2 kB gzipped); a season is one call per distinct circuit in parallel, and a
 * circuit hosting two rounds is fetched once. The cards appear only when every chunk has
 * settled, so the grid doesn't fill in piecemeal. `loadCircuit` resolves null rather than
 * rejecting, so one bad chunk renders one card without an outline and holds up nothing else.
 *
 * Round 0 is pre-season testing, which `/api/races` serves twice and which is not a Grand Prix.
 */
export function useSeasonCircuits(year: number): UseSeasonCircuitsReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      let races: Race[];
      try {
        races = await getRaces(year);
      } catch (error) {
        console.error('Failed to fetch the calendar:', error);
        if (active) setLoaded({ year, circuits: null, error: true });
        return;
      }

      const rounds = races.filter((race) => typeof race.round === 'number' && race.round > 0);
      const ids = Array.from(
        new Set(
          rounds
            .map((race) => resolveCircuitId(race.location))
            .filter((id): id is string => id !== null),
        ),
      );
      const outlines = new Map(
        await Promise.all(ids.map(async (id) => [id, await loadCircuit(id)] as const)),
      );
      if (!active) return;

      setLoaded({
        year,
        error: false,
        circuits: rounds.map((race) => {
          const id = resolveCircuitId(race.location);
          const geometry = id ? (outlines.get(id) ?? null) : null;
          return { race, geometry, slug: geometry && id ? canonicalSlug(id) : null };
        }),
      });
    }

    void load();

    return () => {
      active = false;
    };
  }, [year, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.year === year ? loaded : null;
  return {
    circuits: current?.circuits ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
