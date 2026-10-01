'use client';

import { useEffect, useState } from 'react';
import type { BriefingExample } from '@/data/briefing-examples';
import { loadBriefingExample } from '@/lib/briefing-examples';

export type BriefingExampleStatus = 'loading' | 'ready' | 'missing';

export interface UseBriefingExampleReturn {
  example: BriefingExample | null;
  status: BriefingExampleStatus;
}

interface Loaded {
  id: string;
  example: BriefingExample | null;
}

/**
 * One saved example, loaded as its own chunk.
 *
 * Keyed by id rather than reset in the effect, as `useCircuitWinners` is: a result for an id the
 * page has moved on from is simply not the current one, so nothing has to be cleared on change.
 * Needs nothing from the backend, which is the point — it is what the page shows when the backend
 * cannot help.
 */
export function useBriefingExample(id: string): UseBriefingExampleReturn {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    void loadBriefingExample(id).then((example) => {
      if (active) setLoaded({ id, example });
    });
    return () => {
      active = false;
    };
  }, [id]);

  const current = loaded?.id === id ? loaded : null;
  if (current === null) return { example: null, status: 'loading' };
  return current.example
    ? { example: current.example, status: 'ready' }
    : { example: null, status: 'missing' };
}
