'use client';

import { useCallback, useRef, useState } from 'react';

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
 * The direction is a **ref, not state**: it is only ever read by the swap variant during the
 * transition it belongs to, so storing it in state would schedule a second render for a value no
 * one paints. Keeping it out of state is also what guarantees it is already correct when the
 * variant reads it — a `setState` would not have landed yet on the render that starts the
 * animation.
 *
 * Selection is by index rather than by id because "which way did we move" is only meaningful in
 * the range's own hard-to-soft order, and the index *is* that order.
 */
export function useCompoundSelection(initial = 2): CompoundSelection {
  const [index, setIndex] = useState(initial);
  const direction = useRef(1);

  const select = useCallback((next: number) => {
    setIndex((prev) => {
      if (next === prev) return prev;
      direction.current = next > prev ? 1 : -1;
      return next;
    });
  }, []);

  // `RACE_COMPOUNDS` is a non-empty literal and `index` only ever comes from a control bound to
  // it, so the fallback is unreachable — it exists to satisfy `noUncheckedIndexedAccess` without
  // a non-null assertion.
  const compound = RACE_COMPOUNDS[index] ?? RACE_COMPOUNDS[0]!;

  return { index, compound, direction: direction.current, select };
}
