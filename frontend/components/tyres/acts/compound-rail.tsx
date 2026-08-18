'use client';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

import { compoundLetter } from '../lab/compound-letter';

export interface CompoundRailProps {
  index: number;
  onSelect: (index: number) => void;
  /** Rendered id, so the panel it controls can point back at it. */
  id?: string;
}

/**
 * The compound selector: the outlined pill-row taken from Pirelli's own page.
 *
 * Deliberately **buttons, not a tablist**. A WAI-ARIA tablist owns the arrow keys and moves focus
 * with selection, which is right when the tabs are the only thing on the row — but this rail sits
 * beside a disclosure control per row, so arrow keys have to stay with the browser and Tab has to
 * reach both controls in each row. `aria-pressed` says "this one is on" without claiming the
 * keyboard contract a tablist would.
 *
 * The letter is the non-colour channel for identity and the swatch is the colour one, so the row
 * is still unambiguous to a reader who cannot separate the five hues.
 */
export function CompoundRail({ index, onSelect, id }: CompoundRailProps) {
  return (
    <ul id={id} className="space-y-2.5" role="list">
      {RACE_COMPOUNDS.map((c, i) => {
        const selected = i === index;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors duration-300 sm:gap-5 sm:px-5',
                focusRingOffsetBase,
                selected
                  ? 'border-f1-red bg-white/[0.05]'
                  : 'border-f1-red/30 hover:border-f1-red/70',
              )}
            >
              <span
                aria-hidden="true"
                className="font-display text-[2.1rem] font-black leading-none tracking-[-0.06em] transition-colors duration-600 sm:text-[2.6rem]"
                // Selected: the compound hex, which at >=33px clears the 3:1 large-text bar for
                // all five. Unselected: zinc-400 (7.76:1) and *not* zinc-600, which measured
                // 2.5:1 and failed even the large-text bar — this letter is the compound's
                // non-colour identity channel, so an unreadable one defeats its whole purpose.
                style={{ color: selected ? c.color : '#a1a1aa' }}
              >
                {compoundLetter(c)}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    // `sm:text-[1rem]`, never `sm:text-base` — `base` is a colour token here and
                    // at a responsive variant the colour wins, painting this `#09090b`.
                    'block text-sm font-bold transition-colors sm:text-[1rem]',
                    selected ? 'text-ink' : 'text-zinc-300',
                  )}
                >
                  {c.name}
                </span>
                <span className="block truncate text-xs text-zinc-400">{c.tagline}</span>
              </span>
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-full border-2 border-white/20"
                style={{ backgroundColor: c.color }}
              />
              {selected && <span className="sr-only">(selected)</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
