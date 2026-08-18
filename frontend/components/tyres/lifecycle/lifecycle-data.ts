import { LIFECYCLE_STAGES, type LifecycleStage } from '@/data/tyres-data';

/**
 * The visual state that drives the photographic tyre, one row per lifecycle stage.
 *
 * Two rules, both inherited from the page they serve:
 *
 * **Nothing here is a new fact.** `wear`, `thermal` and the short `note` are the same numbers the
 * drawn-SVG version drove the tyre with (`STAGE_STATE` in the old `act-lifecycle.tsx`); `summary`
 * is a one-sentence paraphrase of the stage's own `body` in `data/tyres-data.ts` and states
 * nothing the sourced body does not. The full body and its `SourceRef` still render, behind the
 * card's disclosure — this layer only decides how worn and how hot the rubber *looks* and gives a
 * non-expert a single readable line.
 *
 * **The join is by id, and the order is the data's.** `LIFECYCLE` zips these visuals onto
 * `LIFECYCLE_STAGES` in that array's order, so a stage added to the data with no visual row fails
 * loudly here rather than rendering an un-worn tyre by accident.
 */
export type ThermalState = 'cold' | 'optimal' | 'hot';

export interface StageVisual {
  /** Tread wear, `0` (new) to `1` (spent). Interpolated between stages as the reader scrolls. */
  wear: number;
  thermal: ThermalState;
  /** A two-or-three-word readout for the tyre HUD, e.g. "In the blankets". */
  note: string;
  /** One conversational sentence, derived strictly from the stage's sourced `body`. */
  summary: string;
}

const STAGE_VISUALS: Record<string, StageVisual> = {
  preparation: {
    wear: 0,
    thermal: 'cold',
    note: 'In the blankets',
    summary:
      'It starts life warming in electric blankets, so it is near temperature before the session even begins.',
  },
  'no-blankets': {
    wear: 0,
    thermal: 'cold',
    note: 'Cold out of the box',
    summary:
      'The full wet is the exception — it gets no blankets at all, so a wet restart begins on a genuinely cold tyre.',
  },
  prescriptions: {
    wear: 0.05,
    thermal: 'optimal',
    note: 'Within limits',
    summary:
      'Every circuit fixes minimum pressures and camber limits in advance to keep the loads the tyre takes in check.',
  },
  'formation-lap': {
    wear: 0.1,
    thermal: 'optimal',
    note: 'Coming into the window',
    summary:
      'The blankets come off and one lap of weaving and hard braking brings the tyre up into its working window.',
  },
  stint: {
    wear: 0.45,
    thermal: 'hot',
    note: 'Working, and paying for it',
    summary:
      'Now it only gets worse: sliding overheats the surface, and enough hard use ages the rubber for good.',
  },
  'pit-stop': {
    wear: 0.8,
    thermal: 'hot',
    note: 'Worn, coming off',
    summary:
      'The rules force at least one stop in a dry race, so off it comes — 720 times across the 2025 season.',
  },
  after: {
    wear: 1,
    thermal: 'cold',
    note: 'Off the car, cooling',
    summary:
      'Off the car for the last time, every tyre is sent away to be broken back down into raw materials.',
  },
  materials: {
    wear: 1,
    thermal: 'cold',
    note: 'Out of the cycle',
    summary:
      'What it was made from: FSC-certified natural rubber, about 18% of the finished tyre’s weight.',
  },
};

export interface LifecycleEntry {
  stage: LifecycleStage;
  visual: StageVisual;
}

/** The lifecycle, stages joined to their visual state in the data's own order. */
export const LIFECYCLE: LifecycleEntry[] = LIFECYCLE_STAGES.map((stage) => {
  const visual = STAGE_VISUALS[stage.id];
  if (!visual) {
    // A data-only edit that adds a stage without a visual row would otherwise render a pristine
    // tyre for it silently; make that a build/test failure instead.
    throw new Error(`lifecycle-data: no StageVisual for stage "${stage.id}"`);
  }
  return { stage, visual };
});

export const LIFECYCLE_COUNT = LIFECYCLE.length;

/** Wear as a whole-number percentage, for the HUD readout and the card's state label. */
export function wearPercent(wear: number): number {
  return Math.round(wear * 100);
}

/** Plain-language thermal label, so the state never rests on colour alone. */
export const THERMAL_LABEL: Record<ThermalState, string> = {
  cold: 'Cold',
  optimal: 'In the window',
  hot: 'Hot',
};

/**
 * A decorative indicator colour per thermal state — the dot beside the always-present text label,
 * never the sole carrier of the state. Kept here so the card and the HUD agree.
 */
export const THERMAL_DOT: Record<ThermalState, string> = {
  cold: '#5a86c0',
  optimal: '#f5b544',
  hot: '#e8382f',
};
