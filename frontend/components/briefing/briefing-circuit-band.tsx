'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, type MotionProps } from 'motion/react';
import { CircuitGlow } from '@/components/candy/circuit-glow';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { loadCircuitByLocation, type CircuitGeometry } from '@/lib/circuit-geometry';
import { cn } from '@/lib/utils';
import type { RaceInfo } from '@/types';

/**
 * The header band that sits above a briefing: the circuit outline on one side, a four-row data
 * column on the other.
 *
 * **The text column sits beside the glow, never over it, and that is a measured constraint rather
 * than a layout preference.** Over the red `CircuitGlow`'s line layer (`f1-red` at 0.9 alpha) the
 * branch's neutrals collapse: `zinc-400` measures 2.24:1 and `zinc-300` 3.88:1, both under the
 * 4.5:1 small-text bar. Only `ink` clears it, at 5.20:1 — 0.7 of headroom over a *blurred,
 * animated* backdrop whose exact alpha at any given pixel is not knowable, which is not a margin
 * worth spending. Beside the glow, on the page's own backdrop (`bg-zinc-950` under
 * `TopoBackground` at 0.12, i.e. `#212124`), `zinc-400` is back to 6.27:1 and the branch floor
 * holds normally. If a later pass overlaps the two for visual effect, it breaks this.
 *
 * **Every row is a real field.** `RaceInfo` carries no track length, no lap count and no corner
 * count — those numbers exist only inside the synthesised briefing prose — so nothing here is
 * estimated or placeholdered. A row with no data is not rendered at all: a null `round` drops the
 * ROUND row, an unparseable date drops DATE, and a circuit this repo has no geometry for drops
 * both the outline and the CIRCUIT row while the rest of the band renders unchanged. A briefing
 * missing its decorative track map is still a complete briefing.
 */
export interface BriefingCircuitBandProps {
  /** The resolved race, straight off the `race_info` stream event. */
  raceInfo: RaceInfo;
  /**
   * The calendar round, joined by the parent from the `/api/races/{year}` list — `RaceInfo` does
   * not carry it. Null for a race not on the current calendar (a typed historical query), and a
   * null round hides the ROUND row rather than printing a placeholder.
   */
  round: number | null;
  className?: string;
}

/** The house easing. A mutable tuple because motion's `BezierDefinition` is one. */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Seconds between consecutive rows entering. The branch's stagger band is 80–120 ms and this band
 * is at most four rows, so the last one lands 270 ms after the first — well inside the window
 * where the sequence still reads as one gesture rather than as a list being dealt out.
 */
const ROW_STAGGER_S = 0.09;

/** One row's own fade, inside the 500–900 ms band the motion rules set. */
const ROW_DURATION_S = 0.6;

/**
 * Month abbreviations for the date row, in the mono-caps register the rest of the band's labels
 * use. Deliberately not `toLocaleString('en', { month: 'short' })`: that is locale-dependent, so
 * the same briefing would read `MAY` for one user and `MAI` for another while the surrounding
 * labels stayed English, and jsdom's ICU build is not guaranteed to agree with the browser's.
 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * `"2025-05-25 00:00:00"` → `"25 MAY 2025"`, or `null` if the string is not that shape.
 *
 * **The separator is a space, not a `T`.** `new Date("2025-05-25 00:00:00")` happens to parse in
 * V8 and in jsdom, but the ECMAScript spec only guarantees the ISO-8601 `T` form, so a `Date` here
 * would be relying on implementation-defined behaviour to read a value the backend controls. It
 * would also drag in the local timezone: a midnight UTC race date rendered through a `Date` in a
 * negative offset comes out as the *previous day*, which is a wrong fact printed confidently.
 * Splitting the string and re-assembling the parts cannot do either, and needs no date library.
 *
 * Returning `null` rather than falling back to the raw string keeps the "no invented or
 * half-formatted data" rule: a row that cannot be formatted is a row that is not shown.
 */
function formatBandDate(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.split(' ')[0] ?? '');
  if (!match) return null;

  // Destructured with defaults rather than `!`: under `noUncheckedIndexedAccess` a regex group is
  // `string | undefined`, and a default cannot lie about a missing value the way an assertion can.
  // They are unreachable — the pattern has three mandatory groups — and the month lookup below is
  // what actually rejects a nonsense month like `13`.
  const [, year = '', month = '', day = ''] = match;
  const name = MONTHS[Number(month) - 1];
  return name ? `${day} ${name} ${year}` : null;
}

/**
 * The circuit geometry for a location, or `null` while it loads and for a location this repo has
 * no outline for.
 *
 * **The join key is `location`, not `circuit_id`.** The backend derives `circuit_id` from the
 * *event* name (`italian_grand_prix`), which names a Grand Prix rather than a track, while
 * `location` (`Monza`) is what the geometry index is keyed on. Keying on `circuit_id` would miss
 * most of the calendar.
 *
 * The load is async because `loadCircuitByLocation` reaches for a single JSON through a dynamic
 * import and the bundler splits each of the 40 circuits into its own chunk — a static import of
 * all of them is 168 kB to draw one. So this holds `null` until the chunk lands.
 *
 * **The `active` flag is not boilerplate.** A user can submit a second race while the first
 * circuit's chunk is still in flight, and without the guard that resolution would paint the
 * *previous* race's circuit name and outline onto the new race's band — a wrong fact, not a
 * cosmetic glitch. Clearing to `null` synchronously when the location changes closes the other
 * half of the same window, where the old geometry stays on screen next to the new race's rows.
 */
function useCircuitGeometry(location: string): CircuitGeometry | null {
  const [geometry, setGeometry] = useState<CircuitGeometry | null>(null);

  useEffect(() => {
    let active = true;
    setGeometry(null);

    void loadCircuitByLocation(location).then(
      (loaded) => {
        if (active) setGeometry(loaded);
      },
      // A rejected load is a miss, and a miss hides the visual entirely — no placeholder shape, no
      // error banner, and deliberately no `console.warn` either. Nothing on this band is worth
      // interrupting a briefing for.
      () => {
        if (active) setGeometry(null);
      },
    );

    return () => {
      active = false;
    };
  }, [location]);

  return geometry;
}

interface BandRow {
  label: string;
  value: ReactNode;
  /**
   * Size and colour together in one literal string, never through `cn()`: `twMerge` collapses a
   * font-size and a text-colour it cannot tell apart into whichever came last, which is how
   * `cn('text-mega text-ink')` silently returns `text-ink` alone on this branch.
   */
  valueClassName: string;
  /** ROUND alone carries the accent — see the rule's comment at the call site. */
  accent?: boolean;
}

export function BriefingCircuitBand({ raceInfo, round, className }: BriefingCircuitBandProps) {
  const geometry = useCircuitGeometry(raceInfo.location);
  const reducedMotion = useReducedMotionSafe();

  const date = formatBandDate(raceInfo.date);

  const rows: BandRow[] = [];

  if (round !== null) {
    rows.push({
      label: 'ROUND',
      // Zero-padded to two digits, matching the `RND.08` kicker idiom the landing hero's preview
      // card and the `/candy` styleguide already print. It is a formatting choice, not invented
      // data — the digits are the round the parent joined from the calendar.
      value: String(round).padStart(2, '0'),
      valueClassName: 'font-display text-3xl leading-none tracking-tight text-ink',
      accent: true,
    });
  }

  rows.push({
    label: 'LOCATION',
    value: raceInfo.location,
    valueClassName: 'font-display text-xl uppercase leading-none tracking-tight text-ink',
  });

  if (date) {
    rows.push({
      label: 'DATE',
      value: date,
      valueClassName: 'font-mono text-sm uppercase tracking-[0.14em] text-ink',
    });
  }

  if (geometry) {
    rows.push({
      // **`geometry.name`, never `raceInfo.circuit_id`.** `circuit_id` is derived from the event
      // name, so it says `italian_grand_prix` where this row wants `Autodromo Nazionale Monza` —
      // printing it would label the circuit row with the name of a Grand Prix, which is a worse
      // label than printing nothing.
      label: 'CIRCUIT',
      value: geometry.name,
      valueClassName: 'text-sm leading-snug text-ink',
    });
  }

  return (
    <div
      className={cn(
        'grid items-center gap-6',
        // Two columns only when there is an outline to put in the first one. A fixed
        // `sm:grid-cols-[…]` would leave an empty 11rem gutter on every circuit this repo has no
        // geometry for, which is the placeholder the spec's "a miss hides the visual entirely"
        // rule exists to prevent — an invisible one, but it still pushes the data column across.
        geometry && 'sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8',
        className,
      )}
    >
      {geometry && (
        // `aspect-square` because `CircuitGlow`'s user space is square and it letterboxes with
        // `xMidYMid meet` — a non-square box draws the lap smaller with dead space either side
        // rather than filling, so the wrapper is what makes it read tight. No `corners`: the
        // vendored set is outlines only, and there is no real corner data to pass.
        <div className="mx-auto aspect-square w-full max-w-[11rem] sm:mx-0">
          {/*
           * `draw="immediate"`, not `"onView"`. This band appears at the top of a result the user
           * has just asked for and is already looking at; a viewport-triggered draw on a surface
           * that streams in would either fire instantly anyway or, worse, wait for a scroll that
           * never comes. `onView` is for static page sections.
           *
           * `geometry.points` is already `Point[]` and comes straight out of state, so its
           * identity is stable across re-renders — `CircuitGlow` memoises its scaling and its path
           * string on `points`, and rebuilding the array in render would invalidate both on every
           * parent render. `toPoints` is for the static-JSON call sites, not this one.
           */}
          <CircuitGlow points={geometry.points} draw="immediate" />
        </div>
      )}

      {/*
       * A description list, because that is what four label/value pairs are: `dt`/`dd` gives a
       * screen reader the association between `ROUND` and `08` that a pair of divs would not.
       * `div` wrappers around each pair are valid inside a `dl` in HTML5 and are what let one row
       * be a single motion element.
       */}
      <dl className="min-w-0 divide-y divide-white/10">
        {rows.map((row, index) => (
          <motion.div
            key={row.label}
            className="relative grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-3 pl-4"
            {...rowMotion(index, reducedMotion)}
          >
            {/*
             * ROUND's red row treatment, and it is deliberately a **rule rather than red text**.
             * `f1-red` measures 3.23:1 on this page's backdrop: it clears WCAG's 3:1 large-text
             * bar and fails the 4.5:1 small-text one, so the `ROUND` label at 11px could not be
             * red under any reading, and the numeral — at 30px, comfortably past the large-text
             * threshold — would be legal but would be spending 0.23 of headroom to say something
             * a 2px rule says with none. Red as a rule, bar, tick or fill is unconstrained.
             *
             * Absolutely positioned, so adding it to one row cannot shift that row's text against
             * the other three; `pl-4` is on every row for the same reason, whether or not the rule
             * is there to fill it.
             */}
            {row.accent && (
              <span className="absolute inset-y-0 left-0 w-[2px] bg-f1-red" aria-hidden="true" />
            )}
            {/*
             * The branch's mono-caps kicker register, at its `zinc-400` floor — 6.27:1 on this
             * page's backdrop. `zinc-500` is 3.32:1 here and is not available at this size, which
             * is the rule the whole branch now holds to.
             */}
            <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              {row.label}
            </dt>
            <dd className={row.valueClassName}>{row.value}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One row's entrance, or nothing at all under reduced motion.
 *
 * The reduced-motion branch returns the **static final state** by returning no motion props: a
 * `motion.div` with none renders exactly where it will end up, immediately. That is cheaper and
 * safer than a zero-duration animation, which still writes a transform.
 *
 * Opacity and transform only, so a row entering cannot reflow the band — CLS stays 0. The text is
 * in the DOM from the first render either way; the animation decides how it appears, never
 * whether it exists.
 */
function rowMotion(index: number, reducedMotion: boolean): MotionProps {
  if (reducedMotion) return {};
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: ROW_DURATION_S,
      delay: index * ROW_STAGGER_S,
      ease: EASE_OUT_EXPO,
    },
  };
}
