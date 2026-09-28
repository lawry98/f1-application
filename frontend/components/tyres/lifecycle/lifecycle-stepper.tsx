'use client';

import { motion } from 'motion/react';

import { focusRing, focusRingOffsetBase, focusRingOnRedFill } from '@/lib/focus';
import { cn } from '@/lib/utils';

import { LIFECYCLE } from './lifecycle-data';
import { EASE_OUT_EXPO, LIFECYCLE_TIMING } from './lifecycle-motion';

/**
 * The eight-stage journey control.
 *
 * Real buttons in document order, so Tab walks the sequence; the active one carries
 * `aria-current="step"` and a shared-layout indicator (`layoutId`) that slides between stages
 * rather than cutting. Previous/Next are real buttons too, disabled at the ends. Every button
 * keeps a full `Step X of N: name` accessible name and a ≥44px hit target.
 *
 * The component holds no state — the active stage and every click are owned by the parent's
 * `useLifecycleActiveStage`, so a numbered jump, a Previous/Next step and a scroll all resolve
 * through one path.
 */

export interface LifecycleStepperProps {
  activeIndex: number;
  total: number;
  onSelect: (index: number) => void;
  reduced: boolean;
}

export function LifecycleStepper({ activeIndex, total, onSelect, reduced }: LifecycleStepperProps) {
  const indicatorTransition = reduced
    ? { duration: 0 }
    : { duration: LIFECYCLE_TIMING.indicator, ease: EASE_OUT_EXPO };

  return (
    <div className="mt-6 lg:mt-8">
      <ol className="flex flex-wrap gap-1.5" role="list">
        {LIFECYCLE.map((entry, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          return (
            <li key={entry.stage.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'group relative flex h-11 w-11 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                  isActive
                    ? cn('border-f1-red', focusRingOnRedFill, 'focus-visible:ring-offset-base')
                    : cn(
                        isDone
                          ? 'border-f1-red/45 hover:border-f1-red'
                          : 'border-white/15 hover:border-white/40',
                        focusRingOffsetBase,
                      ),
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="lifecycle-indicator"
                    className="absolute inset-0 rounded-full bg-f1-red"
                    transition={indicatorTransition}
                  />
                )}
                {/*
                 * The numeral's own colour, explicit in every branch — not just `isActive` — and
                 * with its own `transition-colors` rather than the button's.
                 *
                 * The previous version only set `text-white` here and otherwise left the numeral
                 * to *inherit* `color` from the button, which had no colour utility of its own
                 * while active. That inherited value is what a real scroll-driven `isActive` →
                 * `isDone` flip (the `IntersectionObserver` in `useLifecycleActiveStage`) exposed:
                 * the browser's transition for the button's `color` property animated from
                 * whatever ambient/UA value it held while unset — measured near-black
                 * (`rgb(8, 8, 8)`, `rgb(40, 40, 40)` across repeated runs) — up to the new
                 * `text-zinc-200`, and the numeral, inheriting `color` live, painted that same
                 * near-black-on-near-black frame for part of the 150ms transition. Giving the
                 * numeral its own resting colour in every state means no property here ever
                 * starts a transition from an unset/inherited value — the three end states
                 * (white / zinc-200 / zinc-400) are unchanged, and the only new behaviour is the
                 * `group-hover:text-zinc-200` that replaces the button's old `hover:text-zinc-200`
                 * (moved here since the numeral no longer inherits it).
                 */}
                <span
                  className={cn(
                    'relative z-10 transition-colors',
                    isActive ? 'text-white' : isDone ? 'text-zinc-200' : 'text-zinc-400 group-hover:text-zinc-200',
                  )}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="sr-only">{`Step ${i + 1} of ${total}: ${entry.stage.name}`}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex gap-2">
        <StepButton
          label="Previous stage"
          disabled={activeIndex === 0}
          onClick={() => onSelect(activeIndex - 1)}
        />
        <StepButton
          label="Next stage"
          disabled={activeIndex === total - 1}
          onClick={() => onSelect(activeIndex + 1)}
          primary
        />
      </div>
    </div>
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
        'min-h-11 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? cn('border-f1-red bg-f1-red text-white hover:bg-red-700', focusRingOnRedFill, 'focus-visible:ring-offset-base')
          : cn('border-white/20 text-zinc-300 hover:border-white/40 hover:text-ink', focusRing),
      )}
    >
      {label}
    </button>
  );
}
