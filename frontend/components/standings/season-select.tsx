'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

interface SeasonSelectProps {
  /** Newest first, as `standingsYears` returns them. */
  years: number[];
  value: number;
  onChange: (year: number) => void;
  className?: string;
}

/**
 * The `/standings` season picker.
 *
 * A **native `<select>`** for the reasons `livery-select.tsx` gives: a short list of mutually
 * exclusive plain options is what the platform control is for, and it arrives with keyboard
 * operation, typeahead, correct ARIA and the OS picker on a phone already working.
 */
export function SeasonSelect({ years, value, onChange, className }: SeasonSelectProps) {
  const id = useId();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
      >
        Season
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'appearance-none rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-9',
            'text-sm font-semibold text-white transition-colors hover:border-zinc-600',
            // A filled control on `base`, so the ring is held off the fill by a band of the page
            // colour — the choice `livery-select.tsx` makes, for the same reason.
            focusRingOffsetBase,
          )}
        >
          {years.map((year) => (
            // Explicit colours for Windows and Linux, whose popup list inherits the control's
            // palette; macOS draws it with the system one and ignores both.
            <option key={year} value={year} className="bg-zinc-900 text-white">
              {year}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
      </div>
    </div>
  );
}
