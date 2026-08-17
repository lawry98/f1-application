'use client';

import { useRef } from 'react';

import { cn } from '@/lib/utils';
import { compoundRing, compoundTextOnTab } from '@/lib/tyre-utils';
import type { RaceCompound } from '@/data/tyres-data';

interface CompoundTablistProps {
  compounds: RaceCompound[];
  index: number;
  onSelect: (index: number) => void;
  tabId: (id: string) => string;
  panelId: (id: string) => string;
  className?: string;
}

/**
 * The direct-selection control, built as a real WAI-ARIA tablist.
 *
 * Tabs rather than a carousel role, because that is what this actually is: pick one of five,
 * see its panel. A screen-reader user gets "tab, 3 of 5, selected" for free, which no amount
 * of `aria-roledescription="carousel"` would have given them.
 *
 * **Roving tabindex with automatic activation.** Only the selected tab is in the page's tab
 * order; arrow keys move both the selection and the focus. Focus is moved imperatively in the
 * key handler rather than in an effect, because the buttons are all mounted already and doing
 * it synchronously is what keeps a second arrow press landing on the tab the user believes
 * they are on.
 */
export function CompoundTablist({
  compounds,
  index,
  onSelect,
  tabId,
  panelId,
  className,
}: CompoundTablistProps) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Move by a **raw** target, which may be `-1` or `compounds.length`.
   *
   * `onSelect` gets the raw value and `stepTo` wraps it, because direction is derived from the
   * raw target: `-1` reads as backward, `count` as forward. Wrapping here first — which is what
   * this did originally — destroys that information. ArrowLeft at index 0 became `select(4)`,
   * indistinguishable from a deliberate four-step jump forward, so the scene slid in from the
   * right while the Previous button brought the identical state change in from the left.
   *
   * Focus still needs the wrapped index, because that is the button that exists.
   */
  const go = (next: number) => {
    const wrapped = ((next % compounds.length) + compounds.length) % compounds.length;
    onSelect(next);
    tabs.current[wrapped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Only the four keys this widget owns are intercepted. ArrowUp/ArrowDown are left to the
    // page so a keyboard user can still scroll while focus sits on a tab.
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        go(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        go(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(compounds.length - 1);
        break;
      default:
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Tyre compound"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        // `p-1`, not `pb-1`. `overflow-x: auto` forces `overflow-y: auto` as well, so a
        // `ring-offset-2` focus ring — a box-shadow sitting 4px outside the button — is clipped
        // on all four sides without padding. `teams-chip-strip.tsx` uses `px-4 py-2` for this.
        'flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {compounds.map((compound, i) => {
        const selected = i === index;
        return (
          <button
            key={compound.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={tabId(compound.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            // Only the selected compound's panel is in the DOM, so pointing the other four at
            // an id that does not exist would be invalid ARIA.
            aria-controls={selected ? panelId(compound.id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(i)}
            style={
              {
                // Tailwind's `ring-*` is a box-shadow reading this custom property; setting
                // `outlineColor` would do nothing. Same arrangement as the teams rail.
                '--tw-ring-color': compoundRing(compound.color),
                // `OnTab`, not `OnPage`: the selected tab has a `bg-zinc-800/80` highlight behind it.
                ...(selected ? { color: compoundTextOnTab(compound.color) } : {}),
              } as React.CSSProperties
            }
            className={cn(
              'group relative shrink-0 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              selected ? 'bg-zinc-800/80' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: compound.color }}
              />
              {compound.name}
            </span>
            {/* The active underline keeps the true hex: it is a 2px rule, not text. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity',
                selected ? 'opacity-100' : 'opacity-0',
              )}
              style={{ backgroundColor: compound.color }}
            />
          </button>
        );
      })}
    </div>
  );
}
