import type { Ordinal } from '@/data/tyres-data';
import { cn } from '@/lib/utils';

export interface StatMeterProps {
  label: string;
  value: Ordinal;
  /** The compound's true hex. Decorative here — it fills bars, it never carries text. */
  color: string;
  /** What the ordinal is relative to, for the accessible description. */
  group: string;
  className?: string;
}

/**
 * One property as a display numeral plus a five-segment bar.
 *
 * The bar is the part that does the comparing: five discrete segments read as a position on a
 * scale at a glance, where a number alone has to be held in memory to be compared against the
 * next compound. The numeral stays because the bar cannot be read precisely.
 *
 * **The segments are decorative and the `<dd>` carries the real text.** Filled and empty segments
 * differ by colour *and* by being filled at all, but neither is announced — a screen reader gets
 * "Grip, 5 out of 5, relative to the other dry compounds" from the semantic content, and the
 * whole bar group is `aria-hidden`. That phrasing matters: these ordinals are only meaningful
 * *within* a comparison group, because a full wet's grip is about standing water where no slick
 * has any at all.
 */
export function StatMeter({ label, value, color, group, className }: StatMeterProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1.5 flex items-center gap-2.5">
        <span className="font-display text-[1.75rem] font-black leading-none text-ink">
          {value}
        </span>
        <span className="sr-only">{` out of 5, relative to the other ${group} compounds`}</span>
        <span aria-hidden="true" className="flex gap-[3px]">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="h-3.5 w-[4px] rounded-[1px] transition-colors duration-600"
              style={{ backgroundColor: n <= value ? color : '#3f3f46' }}
            />
          ))}
        </span>
      </dd>
    </div>
  );
}
