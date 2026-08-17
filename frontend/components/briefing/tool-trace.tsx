'use client';

import { useId, useState } from 'react';
import type { ToolResult } from '@/types';
import { LaurelFlourish } from '@/components/candy/laurel-flourish';
import { toolLabel } from '@/lib/constants';

/**
 * The filled squares of the checkered flag, as `[x, y]` in viewBox units.
 *
 * The flag is a 3 × 2 grid of 3-unit squares whose top-left corner is (4.5, 2.5); these are the
 * three that get ink, so the other three read as the flag's ground. A 3 × 3 grid was tried first
 * and is the obvious "more checkered" choice — at the ~14px this renders at, 2.5-unit squares
 * come out at 2.2px and the whole thing greys into a smudge, which is the one failure mode a
 * status icon cannot have. Three columns by two rows keeps every square at 2.6px on screen.
 *
 * Coordinates rather than indices because this array is `.map`ped into `<rect>` children and this
 * repo carries **zero** `eslint-disable` comments, so `react/no-array-index-key` is honoured
 * rather than suppressed — `scribble.tsx` and `laurel-flourish.tsx` both key on the value for the
 * same reason. `${x},${y}` is unique by construction here.
 */
const CHECKS: readonly (readonly [number, number])[] = [
  [4.5, 2.5],
  [10.5, 2.5],
  [7.5, 5.5],
];

/** Side of one check, in viewBox units. The flag is therefore 9 × 6 from (4.5, 2.5). */
const CHECK_SIZE = 3;

/**
 * A checkered flag, hand-authored.
 *
 * There is no checkered flag in `lucide-react` and this does not add a dependency for one glyph;
 * `scribble.tsx`, `laurel-flourish.tsx` and `topo-background.tsx` all hand-author their SVG, so
 * this is the house idiom rather than a shortcut. `Flag` from lucide was rejected explicitly: a
 * plain pennant is the *generic* icon, and the whole point of this mark is that a race person
 * reads "this finished" from the checks without reading a label.
 *
 * Detail is deliberately minimal — a pole, an outline and three filled squares. At the 14px this
 * renders at the scale is 0.875, so the 1-unit outline is 0.875px and the 1.2-unit pole 1.05px:
 * anything finer than that would not survive rasterisation, and anything busier would not resolve.
 *
 * `currentColor` throughout, never a hex: the same trap `topo-background.tsx` documents — under an
 * ancestor with no declared text colour a hard-coded stroke would be the only thing on this page
 * that does not inherit, and the call site below supplies `text-ink`.
 */
function CheckeredFlagIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      // Decorative: the row's `sr-only` run below is what carries this state to a screen reader.
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
    >
      {/* The pole. Runs past the flag at both ends, because a flag hanging off the very top of a
          bare stick reads as a golf pin. */}
      <rect x="2.5" y="2" width="1.2" height="12" fill="currentColor" />
      {/* The flag's ground. Stroked rather than filled so the three empty checks stay empty and
          the mark still reads as a rectangle of cloth rather than three loose squares. */}
      <rect
        x="4.5"
        y="2.5"
        width="9"
        height="6"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.55"
      />
      {CHECKS.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={x}
          y={y}
          width={CHECK_SIZE}
          height={CHECK_SIZE}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export interface ToolTraceProps {
  tools: ToolResult[];
  /**
   * Whether the run has finished. The trace is mounted while the briefing is still streaming —
   * `briefing` is truthy from the first flush — so "completed" cannot be inferred from being
   * rendered at all.
   */
  complete?: boolean;
}

/**
 * The agent's tool trace: a collapsed disclosure strip that opens into one row per tool.
 *
 * **The container is the existing bordered strip, restyled — not a `TicketCard`.** The kit card was
 * the first thing tried and it fights this layout in three separate ways: its `kicker` slot is a
 * padded `<div>`, so the full-width `<button>` that toggles this panel either loses the padding
 * from its hit area or nests a button inside a slot that was designed for a label; its
 * `hover:-translate-y-0.5` lifts the whole panel on hover, which on a *click target that expands*
 * reads as the panel responding to the wrong gesture; and its `notch-card` clip runs across a box
 * whose height changes on every toggle. What the card actually contributes visually — the hairline
 * `border-white/10` over a `bg-white/[0.03]` wash, and `rounded-xl` — is three classes, so those
 * are taken directly and the disclosure semantics are left alone.
 *
 * **Contrast, measured against the real composited backdrop.** `/briefing` paints `bg-zinc-950`
 * under `<TopoBackground className="text-zinc-300" />` at its built-in 0.12, so the page is not
 * `#09090b` but `#212124`. This panel's 3% white wash lifts that to `#282829` and a row's further
 * 2% to `#2c2c2f`, which is the *worst* backdrop any text here sits on. There `zinc-400` measures
 * 5.43:1 and `zinc-500` 2.89:1 — which is why the raw tool id below moved off `zinc-500`, where it
 * shipped, and why nothing here may move back. `tool-trace.test.tsx` composes those three layers
 * and asserts the ratio rather than the class, so a future re-shade fails on the number.
 */
export function ToolTrace({ tools, complete = false }: ToolTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  /**
   * `useId` rather than a hand-made string: `/briefing` can hold only one trace today, but an id
   * that is unique by construction cannot collide with a second one later, and it is stable
   * across hydration, which a counter or a random value is not.
   */
  const listId = useId();

  if (tools.length === 0) return null;

  // Built once and rendered through one of two branches, so the string is provably identical
  // whether or not the laurel is there — a completed run must not silently re-word its own header.
  const heading = (
    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
      Agent Tool Trace ({tools.length} tools executed)
    </span>
  );

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
        aria-expanded={isExpanded}
        /*
         * The rows this opens, named rather than merely adjacent. The id points at an element
         * that only exists while expanded — which is the normal disclosure shape and what
         * `aria-expanded="false"` already tells a reader to expect; the alternative, keeping the
         * list mounted and hidden, would put every row's text in the DOM of a collapsed panel.
         */
        aria-controls={listId}
      >
        {complete ? (
          /*
           * `draw="immediate"`, never `"onView"`: the trace sits at the end of a run the user has
           * been watching, and the panel is very often already on screen when the run completes.
           * An `onView` laurel waits for an intersection that has already happened and simply
           * never fires. It is also mounted only *when* `complete` flips, which is what makes the
           * draw play exactly once — `initial`/`animate` run on mount, not on re-render.
           *
           * `text-ink` because `LaurelFlourish` strokes `currentColor` and sets no colour of its
           * own; without it the branches resolve to black on a near-black panel and are invisible.
           * That exact bug shipped once on this branch. The colour lands on the flourish's wrapper
           * and would cascade into the heading, which is why the heading carries its own
           * `text-zinc-300` rather than inheriting.
           *
           * `[&_svg]:h-6` overrides the component's own `h-9`: 36px branches were tuned against
           * the 36px docked car on `/teardown`, and beside a 12px caps label in a `py-3` header
           * they are three times the height of the thing they flank.
           */
          <LaurelFlourish draw="immediate" className="text-ink [&_svg]:h-6">
            {heading}
          </LaurelFlourish>
        ) : (
          // Bare when incomplete — deliberately *not* a zero-opacity laurel held in reserve. The
          // kit's reduced-motion contract is "render the static final state", and an invisible
          // element is neither a state nor final.
          heading
        )}
        {/*
         * `aria-hidden` because the glyph is a *picture* of `aria-expanded`. Left in the
         * accessible tree it appends itself to the button's name — "Agent Tool Trace (6 tools
         * executed) ▶" — announcing the state twice, the second time as a character a screen
         * reader either spells out or drops. Same rule as the row marks below: text that carries
         * meaning stays accessible, marks that restate it are hidden.
         */}
        <span className="shrink-0 text-zinc-400" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <ul id={listId} className="space-y-2 border-t border-white/10 p-4">
          {tools.map((tool) => (
            <li
              key={tool.tool}
              data-state={tool.success ? 'ok' : 'failed'}
              className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              {/*
               * Shape carries the signal, colour only reinforces it — the same reasoning
               * `briefing-loader.tsx` spells out for its `•`/`×` pair in this same feature: a
               * colour-blind reader has to see a checkered flag become a cross without any hue
               * information at all. The wrapper is a **fixed 16px footprint** for both states so
               * neither one reflows the row, which is the other half of what that component does.
               *
               * Red is unconstrained here because this is a mark, not text: the 4.5:1 small-text
               * bar applies to prose, and a decorative glyph is judged at 3:1, which `red-500`
               * clears at 3.53:1 on this panel. `text-red-500` rather than `text-f1-red` is
               * copied verbatim from `briefing-loader.tsx` so the two failure marks in one feature
               * cannot drift apart.
               */}
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-ink"
                aria-hidden="true"
              >
                {tool.success ? (
                  <CheckeredFlagIcon />
                ) : (
                  <span className="text-sm font-bold leading-none text-red-500">×</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-zinc-200">{toolLabel(tool.tool)}</h4>
                {/*
                 * The badges this replaced (`OK` / `FAIL`) were the *only* accessible carrier of
                 * a tool's outcome, so removing them without this line would delete information
                 * from the page rather than restyle it. It sits between the label and the raw id
                 * so a screen reader linearises the row as "Track profile, Succeeded,
                 * get_track_info", and outside the `<h4>` so the heading's accessible name stays
                 * exactly the display label.
                 */}
                <span className="sr-only">{tool.success ? 'Succeeded' : 'Failed'}</span>
                <p className="truncate font-mono text-xs text-zinc-400">{tool.tool}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
