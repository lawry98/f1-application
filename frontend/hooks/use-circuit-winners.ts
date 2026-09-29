'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCircuitWinners } from '@/lib/api';
import type { CircuitWinnersResponse } from '@/types';

export interface UseCircuitWinnersReturn {
  winners: CircuitWinnersResponse | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

interface Loaded {
  circuitId: string;
  winners: CircuitWinnersResponse | null;
  error: boolean;
}

/**
 * One circuit's recent winners. **Slow when cold**: the backend loads one FastF1 session per
 * hosted season, ~4.6s for three, then caches them for the life of its process. So this is
 * fetched only on the detail page, never prefetched from the grid. Same shape as `use-standings`.
 */
export function useCircuitWinners(circuitId: string): UseCircuitWinnersReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getCircuitWinners(circuitId).then(
      (winners) => {
        if (active) setLoaded({ circuitId, winners, error: false });
      },
      (reason: unknown) => {
        console.error('Failed to fetch circuit winners:', reason);
        if (active) setLoaded({ circuitId, winners: null, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [circuitId, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const current = loaded?.circuitId === circuitId ? loaded : null;
  return {
    winners: current?.winners ?? null,
    loading: current === null,
    error: current?.error ?? false,
    retry,
  };
}
