'use client';

import { useCallback, useState } from 'react';

/** Which way the scene is travelling: `1` forward (new content in from the right), `-1` back. */
export type CarouselDirection = 1 | -1;

export interface CarouselStep {
  index: number;
  direction: CarouselDirection;
}

/**
 * The move from `from` to `to` in a wrapping list of `count`, or `null` if there is no move.
 *
 * `to` is deliberately allowed out of range: `count` means "one past the end" and `-1` means
 * "one before the start", which is how `next()` and `previous()` express a wrap without
 * either of them needing to know it is wrapping.
 *
 * Direction is taken from the **raw** `to`, before it is wrapped back into range. That is the
 * whole reason this is a function rather than a comparison at the call site: after wrapping,
 * a forward move off the end looks like `4 → 0`, and a naive `to > from` would animate the
 * scene backwards — the tyre would slide in from the wrong side at exactly the moment the
 * user is most likely to be watching it.
 *
 * Pure and exported for its own test: it is the one piece of the explorer whose correctness
 * can be established without a DOM.
 */
export function stepTo(from: number, to: number, count: number): CarouselStep | null {
  if (count <= 0) return null;
  const index = ((to % count) + count) % count;
  if (index === from) return null;
  return { index, direction: to > from ? 1 : -1 };
}

export interface CompoundCarousel extends CarouselStep {
  /** Jump straight to an index, deriving direction from where we currently are. */
  select: (index: number) => void;
  next: () => void;
  previous: () => void;
}

/**
 * Which compound is selected, and which way we last moved.
 *
 * Every animated layer in the explorer — tyre, copy, indicators, background type — reads
 * `direction` from here rather than deciding for itself, which is what makes the change read
 * as one composed scene rather than as several animations that happen to fire together.
 *
 * Re-selecting the current compound holds the previous `direction` rather than resetting it,
 * so a stray click on the active tab cannot flip an in-flight transition under itself.
 */
export function useCompoundCarousel(count: number): CompoundCarousel {
  // Forward-facing initial state: the first paint is an entrance, not a rewind.
  const [step, setStep] = useState<CarouselStep>({ index: 0, direction: 1 });

  const select = useCallback(
    (index: number) => setStep((prev) => stepTo(prev.index, index, count) ?? prev),
    [count],
  );
  const next = useCallback(
    () => setStep((prev) => stepTo(prev.index, prev.index + 1, count) ?? prev),
    [count],
  );
  const previous = useCallback(
    () => setStep((prev) => stepTo(prev.index, prev.index - 1, count) ?? prev),
    [count],
  );

  return { index: step.index, direction: step.direction, select, next, previous };
}
