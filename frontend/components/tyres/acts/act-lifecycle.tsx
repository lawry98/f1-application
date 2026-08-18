'use client';

import { useId, useState } from 'react';

import { COMPOUND_COLORS, LIFECYCLE_STAGES } from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { EYEBROW_RED } from '@/lib/tyre-utils';
import { cn } from '@/lib/utils';

import { TyreBody } from '../lab/tyre-body';
import { TyreDefs, makeIdFor } from '../lab/tyre-defs';
import type { ThermalState } from '../lab/tyre-geometry';
import { SourceList } from './source-list';

/**
 * What each stage does to the tyre.
 *
 * Keyed by the ids already in `LIFECYCLE_STAGES`. This is the one place the drawn SVG engine
 * earns its keep over the product renders: there is no photograph of a grained tyre or a tyre at
 * 40% wear, and there are eight of these — the whole point of a state-driven tyre is that the
 * eight states cost eight rows of numbers rather than eight assets.
 */
const STAGE_STATE: Record<string, { wear: number; thermal: ThermalState; note: string }> = {
  preparation: { wear: 0, thermal: 'cold', note: 'Blanketed, below its working range' },
  'no-blankets': { wear: 0, thermal: 'cold', note: 'Cold out of the box' },
  prescriptions: { wear: 0.05, thermal: 'optimal', note: 'Within prescribed limits' },
  'formation-lap': { wear: 0.1, thermal: 'optimal', note: 'Coming into the window' },
  stint: { wear: 0.45, thermal: 'hot', note: 'Working, and paying for it' },
  'pit-stop': { wear: 0.8, thermal: 'hot', note: 'Worn through, surface breaking up' },
  after: { wear: 1, thermal: 'cold', note: 'Off the car, cooling' },
  materials: { wear: 1, thermal: 'cold', note: 'Out of the cycle' },
};

const DEFAULT_STATE = { wear: 0.3, thermal: 'optimal' as ThermalState, note: 'In service' };

/**
 * Act 4 — the life of a tyre.
 *
 * A stepper rather than a scroll sequence: eight stages is too many to pin, and a reader who
 * wants to compare "graining" against "worn" needs to be able to go back one step, which a
 * scroll-driven version makes into a scroll upwards past other content.
 *
 * The tyre is drawn, not photographed, and re-renders per stage from two numbers — see
 * `STAGE_STATE`. Wear shortens and narrows the grooves, dulls the gloss, rakes scuffing across
 * the shoulder and finally sheds marbles; temperature repaints the heat map. Neither is a filter
 * over a photograph, which is why they can be combined freely.
 */
export function ActLifecycle() {
  const [step, setStep] = useState(0);
  const uid = useId();
  const idFor = makeIdFor(uid);

  const stage = LIFECYCLE_STAGES[step] ?? LIFECYCLE_STAGES[0];
  if (!stage) return null;
  const state = STAGE_STATE[stage.id] ?? DEFAULT_STATE;
  const total = LIFECYCLE_STAGES.length;

  return (
    <section
      aria-labelledby="lifecycle-heading"
      className="relative isolate overflow-hidden border-b border-white/10 bg-base"
    >
      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Act 4
        </p>
        <h2
          id="lifecycle-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          The life of a tyre
        </h2>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-14">
          <div className="relative mx-auto w-full max-w-[20rem] lg:sticky lg:top-24 lg:max-w-[24rem]">
            <svg
              viewBox="0 0 400 400"
              role="img"
              aria-label={`${stage.name}: ${state.note}`}
              className="h-auto w-full"
            >
              <TyreDefs
                idFor={idFor}
                color={COMPOUND_COLORS.soft}
                thermal={state.thermal}
                wet={0}
                heatScale={0.85}
              />
              <TyreBody
                idFor={idFor}
                color={COMPOUND_COLORS.soft}
                tread="slick"
                wear={state.wear}
                thermal={state.thermal}
              />
            </svg>
            <p className="mt-3 border-t border-f1-red/25 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              {state.note} · wear {Math.round(state.wear * 100)}%
            </p>
          </div>

          <div className="min-w-0">
            {/* The stepper. Real buttons in document order, so Tab walks the sequence and the
                current step is announced rather than only outlined. */}
            <ol className="flex flex-wrap gap-1.5" role="list">
              {LIFECYCLE_STAGES.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                      focusRingOffsetBase,
                      i === step
                        ? 'border-f1-red bg-f1-red text-white'
                        : i < step
                          ? 'border-f1-red/50 text-zinc-300 hover:border-f1-red'
                          : 'border-white/15 text-zinc-400 hover:border-white/40',
                    )}
                  >
                    <span aria-hidden="true">{i + 1}</span>
                    <span className="sr-only">{`Step ${i + 1} of ${total}: ${s.name}`}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="mt-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                {`Stage ${step + 1} of ${total}`}
              </p>
              <h3 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
                {stage.name}
              </h3>
              <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-zinc-300">
                {stage.body}
              </p>
              {stage.source && (
                <div className="mt-5">
                  <SourceList sources={[stage.source]} label={`Source for ${stage.name}`} />
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-2">
              <StepButton
                label="Previous stage"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              />
              <StepButton
                label="Next stage"
                disabled={step === total - 1}
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                primary
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        focusRingOffsetBase,
        primary
          ? 'border-f1-red bg-f1-red text-white hover:bg-red-700'
          : 'border-white/20 text-zinc-300 hover:border-white/40 hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
