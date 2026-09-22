'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

import { TEAMS, type Team } from '@/data/teams-data';
import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

interface LiverySelectProps {
  selected: Team;
  onSelect: (team: Team) => void;
  className?: string;
}

/**
 * The `/showcase` team picker.
 *
 * A **native `<select>`**, deliberately. Eleven mutually exclusive options with no rich content
 * is the case the platform control exists for, and it arrives with keyboard operation, typeahead,
 * correct ARIA and the OS wheel picker on a phone already working. The alternative — shadcn's
 * Select — would add `@radix-ui/react-select` to a repo that carries exactly one Radix package
 * and dropped `@react-three/drei` over bundle weight, and a hand-rolled listbox would mean owning
 * focus management, Escape, outside-click and typeahead by hand. The one thing native gives up is
 * a colour swatch on every row; the trigger carries the selected team's, and the car on the same
 * screen is the real preview.
 *
 * This lives outside `components/3d/` because it contains no three.js — which is the point. The
 * swatch grid it replaces sat inside `f1-car-showcase.tsx` next to the `<Canvas>`, so the only
 * test that reaches the route mocks the whole module away and asserts nothing about the picker.
 */
export function LiverySelect({ selected, onSelect, className }: LiverySelectProps) {
  const headingId = useId();

  return (
    <div className={cn('mx-auto max-w-md', className)}>
      {/* `h2`, not the `h3` this shipped as: the only other heading on the route is the `h1`
          above, so an `h3` skipped a level and axe reported `heading-order`. It doubles as the
          control's accessible name via `aria-labelledby`, which is why there is no second
          `<label>` repeating the same words on screen. */}
      <h2 id={headingId} className="mb-6 text-center text-2xl font-semibold">
        Select Team Livery
      </h2>

      <div className="relative">
        {/* Decorative, so it keeps the brand hex. The helpers in `lib/team-utils.ts` are for a
            livery colour that carries text; lifting this one would misreport the colour the car
            is wearing. */}
        <span
          data-livery-swatch
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md shadow-inner ring-1 ring-inset ring-white/10"
          style={{ backgroundColor: selected.color }}
        />

        <select
          aria-labelledby={headingId}
          value={selected.id}
          onChange={(event) => {
            const team = TEAMS.find((candidate) => candidate.id === event.target.value);
            if (team) onSelect(team);
          }}
          className={cn(
            'w-full appearance-none rounded-xl border-2 border-zinc-700 bg-zinc-900 py-3 pl-12 pr-11',
            'font-semibold text-white transition-colors hover:border-zinc-600',
            /*
             * A filled, non-red control on a page whose backdrop really is `base` — this route
             * carries no `TopoBackground`, so the offset band is the colour actually behind the
             * control. Same reasoning as the floating credits link in `app/showcase/page.tsx`.
             */
            focusRingOffsetBase,
          )}
        >
          {TEAMS.map((team) => (
            // The explicit colours are for Windows and Linux, where the popup list inherits the
            // control's palette; macOS renders it with the system one and ignores both.
            <option key={team.id} value={team.id} className="bg-zinc-900 text-white">
              {team.shortName}
            </option>
          ))}
        </select>

        <span
          data-livery-chevron
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
        >
          <ChevronDown size={20} />
        </span>
      </div>
    </div>
  );
}
