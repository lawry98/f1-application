'use client';

import { useEffect, useState } from 'react';

import { getRaces } from '@/lib/api';
import { resolveCircuitId } from '@/lib/circuit-geometry';
import type { Race } from '@/types';

/**
 * This circuit's first Grand Prix in `year`, or null — while loading, when the season doesn't
 * visit it, and when the calendar fails. It only adds a row to the detail page, so a failure is
 * logged and renders as "not on the calendar" rather than as an error.
 */
export function useCalendarRace(circuitId: string, year: number): Race | null {
  const [found, setFound] = useState<{ key: string; race: Race | null } | null>(null);
  const key = `${circuitId}:${year}`;

  useEffect(() => {
    let active = true;
    getRaces(year).then(
      (races) => {
        const race =
          races.find(
            (r) => typeof r.round === 'number' && r.round > 0 && resolveCircuitId(r.location) === circuitId,
          ) ?? null;
        if (active) setFound({ key, race });
      },
      (reason: unknown) => {
        console.error('Failed to fetch the calendar:', reason);
        if (active) setFound({ key, race: null });
      },
    );
    return () => {
      active = false;
    };
  }, [circuitId, year, key]);

  return found?.key === key ? found.race : null;
}
