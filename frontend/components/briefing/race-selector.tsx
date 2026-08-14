'use client';

import { useEffect, useId, useState } from 'react';
import { CircuitGlow } from '@/components/candy/circuit-glow';
import { TicketCard } from '@/components/candy/ticket-card';
import { Skeleton } from '@/components/ui/skeleton';
import { loadCircuitByLocation } from '@/lib/circuit-geometry';
import { parseRaceDate } from '@/lib/race-date';
import type { Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';
import type { Race } from '@/types';

/**
 * The chip row's fixed card width, shared with the skeleton so the two cannot drift.
 *
 * A ticket card needs a width of its own — `TicketCard` has no intrinsic one — and the row is a
 * `flex` strip, so without `shrink-0` at a pinned width six cards would compress to fit and the
 * horizontal scroll the spec asks for would never happen. 184px is set by the longest thing a card
 * has to hold: the event name in display caps at 13px, which wraps to two lines for
 * "Emilia Romagna Grand Prix" and one for most others.
 */
const CARD_WIDTH = 'w-[184px]';

/**
 * Skeleton height, **measured in Chromium at 1440 rather than derived**, because the derivation
 * was wrong.
 *
 * The arithmetic this started from — kicker strip 34 + content padding 24 + 48px outline + 8 +
 * name + 8 + 14px date — gives ~152 for one-line names and ~168 for two, and 160 was picked to
 * split them. The rendered row is **177**. The gap is the flex row: cards stretch to the tallest,
 * so the height is never the "average" card, it is always the two-line one, and any six
 * consecutive Grands Prix contain at least one name that wraps at 184px ("Singapore Grand Prix"
 * and "United States Grand Prix" both do). 160 shifted the whole page down 17px the moment the
 * calendar landed.
 *
 * 177 is therefore exact for every realistic calendar and ~16px too tall only for the degenerate
 * case where all six names fit on one line. The number matters because this row swaps
 * skeleton→cards on fetch, and a mismatch is a layout shift on a page whose CLS budget is 0 —
 * which makes it the one value in this file that cannot be checked anywhere but a browser.
 */
const SKELETON_HEIGHT = 'h-[177px]';

/** How many skeletons the loading row shows — the same count `useRaces` slices the calendar to. */
const SKELETON_COUNT = 6;

/**
 * `"2026-03-08 00:00:00"` → `"08 MAR"`, and `""` for anything this cannot read.
 *
 * The parse itself lives in `lib/race-date.ts` — the reasoning for never feeding the backend's
 * string to `new Date()` is written down once there, and this file, `briefing-circuit-band.tsx`
 * and `hooks/use-races.ts` had each grown their own answer to it. All this adds is the card's
 * register: day and month, no year, because the row only ever shows the next six events.
 *
 * Returns an empty string rather than throwing on a shape it does not recognise, and the caller
 * omits the line. A card with no date is still a usable control; a crash inside the quick-select
 * row would take the whole briefing form down with it.
 */
function formatRaceDate(date: string): string {
  const parsed = parseRaceDate(date);
  return parsed ? `${parsed.day} ${parsed.monthAbbr}` : '';
}

export interface RaceSelectorProps {
  /** Upcoming races, already fetched and sliced by the parent. */
  races: Race[];
  /** Whether that fetch is still in flight; drives the skeleton row. */
  loading?: boolean;
  onSelectRace: (raceName: string) => void;
  /** Whether a briefing is generating. Locks every card so a run cannot be discarded. */
  disabled?: boolean;
  /** The race whose briefing is on screen, marked so the user keeps their bearings. */
  activeRace?: string;
}

/**
 * The quick-select row: one mini ticket card per upcoming event, horizontally scrollable.
 *
 * **Presentational.** The `/api/races/{year}` fetch that used to live in this file moved to
 * `hooks/use-races.ts` because the circuit band needs the same list — `Race` is the only shape
 * carrying `round`, and `RaceInfo` (what the stream emits) is not. Keeping a fallback fetch here
 * "in case the parent forgets" would put two copies of the calendar on the wire and let them
 * disagree about what "upcoming" means, which is exactly how the round join goes stale.
 *
 * **There is no flag, and its absence is deliberate.** The spec's word for the first slot is
 * "flag", but this repo has no flag asset and no country→flag helper, and Phase 3 shipped the hero
 * preview card — specified with a "Monaco flag" — using a mono kicker instead. Emoji flags would
 * also undo this phase's own empty-state work, which exists specifically to *delete* an emoji. So
 * the country takes the kicker slot, in the same 11px small-caps register every other kicker on
 * the branch uses.
 */
export function RaceSelector({
  races,
  loading = false,
  onSelectRace,
  disabled = false,
  activeRace,
}: RaceSelectorProps) {
  const headingId = useId();

  /**
   * Circuit outlines keyed by `Race.location`, absent until their chunk lands.
   *
   * Keyed by location and not by race name because `loadCircuitByLocation` is keyed that way and
   * because two events can share a track — one lookup per distinct location rather than per card.
   */
  const [outlines, setOutlines] = useState<Record<string, Point[]>>({});

  useEffect(() => {
    /**
     * One effect for the whole list, not one per card.
     *
     * `loadCircuit` is a dynamic import per circuit, so six cards mean six chunk requests however
     * this is written — but six child effects would also mean six independent `setState`s and six
     * renders of the row. Resolving them together lands the whole row in one commit.
     */
    const locations = Array.from(new Set(races.map((race) => race.location)));
    if (locations.length === 0) return;

    // Guards the resolved import landing after unmount, or after `races` changed underneath it.
    // A flag rather than an AbortController: a dynamic import is not cancellable, so the only
    // thing to do with a late arrival is drop it.
    let active = true;

    void Promise.all(
      locations.map(
        async (location) =>
          [location, (await loadCircuitByLocation(location))?.points ?? null] as const,
      ),
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, Point[]> = {};
      for (const [location, points] of entries) {
        // A miss is simply omitted. Per the spec a circuit we have no geometry for hides the
        // visual entirely — no placeholder shape, no error, no console warning — and
        // `loadCircuitByLocation` returning `null` is how that is expressed.
        if (points) next[location] = points;
      }
      setOutlines(next);
    });

    return () => {
      active = false;
    };
  }, [races]);

  /**
   * Nothing at all rather than a heading over an empty strip.
   *
   * `useRaces` degrades a failed calendar fetch to an empty list, and a label reading "quick select
   * upcoming races:" above no races describes something that is not on screen.
   */
  if (!loading && races.length === 0) return null;

  return (
    <div className="mb-5">
      {/*
       * The 11px small-caps label register the rest of the branch uses, not the old `text-sm`.
       *
       * `text-zinc-500` is 4.12:1 on bare `zinc-950` — already under the 4.5:1 small-text bar —
       * and only **3.23:1** against this page's real backdrop, because `/briefing` lays
       * `TopoBackground` at 12% over `zinc-950` and the composite is `#212124`, not `#09090b`.
       * `zinc-400` measures 6.27:1 there and 5.74:1 through a ticket card's `white/0.03` wash, so
       * it clears on both surfaces this component paints on. No red tick bar: that mark belongs to
       * *section* kickers, and this is a form label sitting inside one of them.
       */}
      <p
        id={headingId}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
      >
        Quick select upcoming races:
      </p>

      {/*
       * `overflow-x-auto` on the row itself is what keeps the strip's overflow off the document —
       * `/teardown` shipped a page-level horizontal scrollbar in Phase 4 from a child that escaped
       * its scroll container, so nothing in here uses a negative margin.
       *
       * Snap points because a free-scrolling row of six fixed-width cards stops mid-card and reads
       * as broken rather than as scrollable. `pt-1 pb-2` is not decoration: `overflow-x: auto`
       * computes `overflow-y` to `auto` as well, and `TicketCard`'s `hover:-translate-y-0.5` would
       * otherwise poke 2px outside the box and raise a vertical scrollbar on hover.
       */}
      <div
        role="group"
        aria-labelledby={headingId}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1"
      >
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton
                key={i}
                className={cn('shrink-0 snap-start bg-zinc-800', CARD_WIDTH, SKELETON_HEIGHT)}
              />
            ))
          : races.map((race) => (
              <RaceChip
                key={race.name}
                race={race}
                points={outlines[race.location]}
                active={race.name === activeRace}
                disabled={disabled}
                onSelect={onSelectRace}
              />
            ))}
      </div>
    </div>
  );
}

interface RaceChipProps {
  race: Race;
  /** The circuit outline, or `undefined` while it loads and for a circuit we do not carry. */
  points?: Point[];
  active: boolean;
  disabled: boolean;
  onSelect: (raceName: string) => void;
}

/**
 * One mini ticket card, as a real button.
 *
 * `TicketCard` renders a `div`, so the control is a `<button>` wrapped around it rather than the
 * card itself made clickable. Everything the old `<Button variant="outline">` gave for free has to
 * survive that swap: a genuinely disabled control (native `disabled`, not a class that only looks
 * locked — a click landing during generation used to abort the run and discard everything it had
 * produced), a visible focus ring, and a visible active marker.
 */
function RaceChip({ race, points, active, disabled, onSelect }: RaceChipProps) {
  const dateLabel = formatRaceDate(race.date);

  return (
    <button
      type="button"
      onClick={() => onSelect(race.name)}
      disabled={disabled}
      /*
       * The active race is marked twice on purpose. The old implementation marked it by border
       * colour alone, which is invisible to a screen reader and to anyone who cannot separate red
       * from zinc — `aria-current="true"` is the non-visual half of the same statement, and it is
       * a fix carried in passing rather than a restyle.
       */
      aria-current={active ? 'true' : undefined}
      className={cn(
        'shrink-0 snap-start rounded-xl text-left',
        CARD_WIDTH,
        /*
         * `components/ui/button.tsx`'s own focus treatment — `outline-none` plus a 1px ring, no
         * offset — with the branch's red. Phase 7 unifies the rings, so this deliberately does not
         * invent a third shape. No ring-offset here, unlike the landing hero's pills: there the
         * red ring sat flush on a red fill at 1.00:1, whereas this ring is painted against the
         * page backdrop at 3.22:1, over the 3:1 that WCAG 2.4.11 asks of a non-text indicator.
         */
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-f1-red',
        // The disabled look, copied from `buttonVariants` so a locked chip reads the same as every
        // other locked control on the page.
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <TicketCard kicker={race.country} className={cn('h-full', active && 'border-f1-red')}>
        <div className="flex flex-col gap-2 px-4 py-3">
          {/*
           * The outline box is reserved whether or not there is geometry to put in it.
           *
           * Geometry arrives asynchronously, one chunk per circuit, so a box that only exists once
           * it resolves would grow the card mid-scroll — a layout shift on a page whose CLS budget
           * is 0. An empty 48px square is not a placeholder shape: nothing is drawn, which is the
           * spec's rule for a miss. `aspect-square` because `CircuitGlow` letterboxes with
           * `xMidYMid meet` and a non-square box would draw the lap smaller with dead space either
           * side. No `corners` — the numbers are illegible at this size.
           *
           * `draw="immediate"`, not the default `onView`: this row sits above the fold on a
           * streaming surface and the geometry lands *after* the observer has already fired, so an
           * on-view draw would leave the outline permanently blank.
           *
           * **The stroke has to be widened here, at the call site.** `CircuitGlow`'s `plain`
           * variant strokes 6 user units in a 500-unit viewBox, tuned for the ~120px outline on
           * the landing hero's ticket card where that lands at 1.4 device pixels. This outline is
           * 48px — a scale of 0.096 — so the kit's 6 would render at 0.58px and antialias away to
           * a smudge, which is the exact failure that component's own docstring records for a
           * too-thin stroke. 16 units × 0.096 ≈ 1.54px, back where the kit intends. A CSS
           * `stroke-width` beats the SVG presentation attribute on specificity, so this needs no
           * kit change — the same trick `landing-hero.tsx` uses to *thin* a Scribble.
           */}
          <div className="aspect-square w-12 shrink-0">
            {points && (
              <CircuitGlow
                points={points}
                variant="plain"
                draw="immediate"
                className="[&_path]:[stroke-width:16]"
              />
            )}
          </div>

          <span className="block font-display text-[13px] uppercase leading-tight tracking-tight text-ink">
            {race.name}
          </span>
          {dateLabel !== '' && (
            <span className="block font-mono text-[11px] tracking-[0.14em] text-zinc-400">
              {dateLabel}
            </span>
          )}
        </div>
      </TicketCard>
    </button>
  );
}
