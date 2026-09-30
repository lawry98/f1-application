'use client';

import { useCallback, useState } from 'react';

import { RACE_COMPOUNDS, type ComparisonGroup, type RaceCompound } from '@/data/tyres-data';

export interface CompoundSelection {
  index: number;
  compound: RaceCompound & { comparisonGroup: ComparisonGroup };
  /** +1 if the last change moved towards a softer compound, -1 towards a harder one. */
  direction: number;
  select: (index: number) => void;
}

/**
 * The selected compound, plus the direction of travel that got us here.
 *
 * Index and direction are **one state value**, so a selection is one update and one render, and
 * the direction the swap variant reads is always the one that belongs to the index it is
 * rendering — derived from the true previous index inside the updater, never from a value a
 * render closed over. `act-strategy.tsx` holds its selection the same way.
 *
 * Selection is by index rather than by id because "which way did we move" is only meaningful in
 * the range's own hard-to-soft order, and the index *is* that order.
 */
export function useCompoundSelection(initial = 2): CompoundSelection {
  const [{ index, direction }, setSelection] = useState({ index: initial, direction: 1 });

  const select = useCallback((next: number) => {
    setSelection((prev) =>
      next === prev.index ? prev : { index: next, direction: next > prev.index ? 1 : -1 },
    );
  }, []);

  // `RACE_COMPOUNDS` is a non-empty literal and `index` only ever comes from a control bound to
  // it, so the fallback is unreachable — it exists to satisfy `noUncheckedIndexedAccess` without
  // a non-null assertion.
  const compound = RACE_COMPOUNDS[index] ?? RACE_COMPOUNDS[0]!;

  return { index, compound, direction, select };
}
