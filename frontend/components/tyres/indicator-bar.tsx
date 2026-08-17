import { cn } from '@/lib/utils';
import type { Ordinal } from '@/data/tyres-data';

interface IndicatorBarProps {
  label: string;
  value: Ordinal;
  /** The compound colour to fill the active steps with. Decorative — true hex. */
  color: string;
  /** Which set the value is ranked within, so the reading is never ambiguous. */
  group: string;
  className?: string;
}

const STEPS = [1, 2, 3, 4, 5] as const;

/**
 * A five-step ordinal readout.
 *
 * Two things it deliberately is not. It is **not a measurement** — there is no unit, and the
 * accessible name says "relative", because Pirelli does not publish per-compound numbers for
 * grip or life and inventing some would be worse than saying less. And it is **not
 * hover-dependent**: the value is in the accessible name and the step count is visible at
 * rest, so nothing here needs a pointer to be understood.
 */
export function IndicatorBar({ label, value, color, group, className }: IndicatorBarProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-400">{value}/5</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${value} out of 5, relative to the other ${group} compounds`}
        className="flex gap-1"
      >
        {STEPS.map((step) => (
          <span
            key={step}
            aria-hidden="true"
            className={cn('h-1 flex-1 rounded-full', step > value && 'bg-zinc-700')}
            style={step <= value ? { backgroundColor: color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
