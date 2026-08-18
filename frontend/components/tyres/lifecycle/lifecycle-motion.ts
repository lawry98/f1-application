import type { Variants } from 'motion/react';

import { LIFECYCLE, type ThermalState } from './lifecycle-data';

/**
 * Every duration, easing, variant and interpolation range the lifecycle animates with, in one
 * place — so the tyre's rotation, the content swap, the stepper indicator and the wear meter all
 * read as one coordinated transition rather than a pile of independently-tuned effects. The card
 * choreography and the wear system both import from here; nothing animates off a literal.
 */

/** The house ease-out. Named the same everywhere so a diff can find every use of it. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const LIFECYCLE_TIMING = {
  /** The concise name settling in as the active stage changes. */
  contentEnter: 0.44,
  /** The tyre's scale settle when a stage becomes active. */
  settle: 0.52,
  /** The radial light pulse on settle. */
  pulse: 0.6,
  /** The shared-layout stepper indicator sliding to the selected stage. */
  indicator: 0.5,
  /** The wear-percentage counter easing to its exact value. */
  counter: 0.7,
  /** Reduced motion keeps the *fact* of a transition — a short cross-fade — and drops the rest. */
  reduced: 0.16,
} as const;

/** +1 moving to a later stage, -1 to an earlier one. Drives the directional content swap. */
export function stageDirection(from: number, to: number): 1 | -1 {
  return to < from ? -1 : 1;
}

/**
 * The concise name's entrance, direction-aware via `custom`: forward (dir +1) it rises from below,
 * backward (dir -1) it drops from above, with a short blur that clears as it settles.
 *
 * There is deliberately **no `exit` variant**. The readout swaps names by keyed re-mount, so the
 * outgoing name is removed the instant the new one mounts — which is exactly what stops two names
 * ever stacking during a fast scroll (see `lifecycle-readout.tsx`). An exit animation would
 * reintroduce that overlap.
 */
export const contentVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, y: 14 * dir, filter: 'blur(6px)' }),
  center: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

/** Reduced motion: a plain fade-in, no displacement or blur. */
export const reducedContentVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
};

export function contentTransition(reduced: boolean) {
  return reduced
    ? { duration: LIFECYCLE_TIMING.reduced, ease: 'linear' as const }
    : { duration: LIFECYCLE_TIMING.contentEnter, ease: EASE_OUT_EXPO };
}

/* ------------------------------------------------------------------------- *
 * Continuous wear, interpolated from scroll progress
 * ------------------------------------------------------------------------- */

/**
 * Scroll progress `0..1` maps across the stages at equal steps; the output is each stage's own
 * wear value. `useTransform(progress, WEAR_STOPS, WEAR_VALUES)` then gives a continuous wear that
 * passes exactly through every stage's number as its card reaches the activation line.
 */
export const WEAR_STOPS: number[] = LIFECYCLE.map((_, i) => i / (LIFECYCLE.length - 1));
export const WEAR_VALUES: number[] = LIFECYCLE.map((e) => e.visual.wear);

/**
 * Wear `0..1` → the opacity of each effect layer over the photograph. Reused every frame by a
 * `useTransform`; the layers themselves are never re-created, only their opacity moves.
 *
 * `haze` greys the whole rubber annulus as it ages; `sheen` is the fresh gloss, so it runs the
 * other way; `scuff` and `shoulder` bite at the tread edge; `marble` only appears once the tyre is
 * genuinely worn, the picked-up rubber of a late stint.
 */
export interface WearOpacityStop {
  input: number[];
  output: number[];
}

export const WEAR_OPACITY: Record<
  'haze' | 'scuff' | 'sheen' | 'shoulder' | 'marble',
  WearOpacityStop
> = {
  haze: { input: [0, 0.45, 1], output: [0, 0.26, 0.46] },
  scuff: { input: [0, 0.1, 0.45, 1], output: [0.05, 0.1, 0.42, 0.8] },
  sheen: { input: [0, 0.45, 1], output: [0.5, 0.24, 0.06] },
  shoulder: { input: [0, 0.45, 0.8, 1], output: [0, 0.16, 0.44, 0.56] },
  marble: { input: [0, 0.62, 0.82, 1], output: [0, 0, 0.34, 0.6] },
};

/* ------------------------------------------------------------------------- *
 * Rotation and settle
 * ------------------------------------------------------------------------- */

/**
 * Total rotation across the whole section, in degrees. Restrained on purpose — under half a turn
 * over eight stages, so at any real scroll speed the tyre reads as *rolling*, not spinning. Scroll
 * up and the same mapping runs backward, so it rolls the other way.
 */
export const ROTATION_TOTAL_DEG = 150;

/** The tyre's scale settle when a new stage becomes active — a small compression, not a bounce. */
export const SETTLE_KEYFRAMES = [1, 0.975, 1];

/* ------------------------------------------------------------------------- *
 * Thermal
 * ------------------------------------------------------------------------- */

/**
 * The heat treatment per thermal state, applied to the rubber over the photograph. Cold reads as a
 * cool desaturating wash, the working window as gentle warmth, hot as a glow that builds at the
 * shoulder. Discrete per stage — thermal is stage data, not a scroll value — so it animates on the
 * active change, not every pixel.
 */
export const THERMAL_TINT: Record<ThermalState, { color: string; opacity: number }> = {
  cold: { color: '#5a86c0', opacity: 0.17 },
  optimal: { color: '#ff9a4d', opacity: 0.1 },
  hot: { color: '#ff3a1e', opacity: 0.32 },
};
