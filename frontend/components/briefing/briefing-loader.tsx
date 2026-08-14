'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { MegaStat } from '@/components/candy/mega-stat';
import { toolLabel } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ToolResult } from '@/types';

/**
 * The graph's stages, in the order `event_generator()` in `backend/api/routes.py` emits
 * them. A row's state is an index comparison against the live `step`, which is why there
 * is no percentage anywhere in this component: the panel can only report the stage the
 * pipeline has actually announced, so it cannot stall at 90%.
 */
const STAGES = [
  { step: 'resolving', label: 'Resolve race' },
  { step: 'planning', label: 'Plan data gathering' },
  { step: 'gathering', label: 'Gather race data' },
  { step: 'synthesizing', label: 'Synthesize briefing' },
] as const;

const TICK_MS = 100;

/**
 * How long a stage must run before its elapsed time is worth showing. Resolving and planning
 * finish in a second or two, and a hint that flashes `0s` on every run is noise; the question
 * this answers — is anything still happening — only arises after a few seconds of silence.
 */
const STAGE_HINT_AFTER_MS = 3000;

interface BriefingLoaderProps {
  /** The resolved race name; empty until the `race_info` event lands. */
  race: string;
  /** The live graph stage. Empty or unrecognised opens on the first stage. */
  step: string;
  /** The backend's own status prose, for the live region. */
  statusMessage: string;
  /** Tools that have returned so far, in arrival order. */
  tools: ToolResult[];
  /** The tools the planner chose, in its order. Empty when the plan is unknown. */
  toolPlan: string[];
  /** Epoch ms the current request began; the elapsed timer's baseline. */
  startedAt: number;
}

type ChipState = 'pending' | 'ok' | 'failed';

interface Chip {
  tool: string;
  state: ChipState;
}

/**
 * The footer's chips: one per planned tool, in the plan's order, each pending until its
 * result lands.
 *
 * Plan order rather than arrival order because the tools run in a pool and finish in
 * whatever order they finish — reordering as results land would make the footer twitch for
 * the whole gathering stage, which is the opposite of what it is for.
 *
 * With no plan — a stream where the event was lost — this degrades to arrival order, which
 * is exactly the behaviour that shipped before the plan existed.
 */
function chipsFor(toolPlan: string[], tools: ToolResult[]): Chip[] {
  const resultFor = new Map(tools.map((tool) => [tool.tool, tool.success]));
  const names = toolPlan.length > 0 ? toolPlan : tools.map((tool) => tool.tool);

  return names.map((tool) => {
    const success = resultFor.get(tool);
    if (success === undefined) return { tool, state: 'pending' };
    return { tool, state: success ? 'ok' : 'failed' };
  });
}

/** `M:SS.d` — tenths are what make it read as a lap timer rather than a stopwatch. */
function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/**
 * A clock that ticks every {@link TICK_MS}, for callers to subtract their own baseline from.
 *
 * Returning `now` rather than an elapsed value is what lets one interval serve both the
 * request timer and the stage timer, and it is why a fresh baseline is reflected in the very
 * next render: the subtraction happens at render time, so no stale elapsed value from an old
 * run is ever visible while waiting for the next tick.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}

export function BriefingLoader({
  race,
  step,
  statusMessage,
  tools,
  toolPlan,
  startedAt,
}: BriefingLoaderProps) {
  const now = useNow();
  const elapsed = now - startedAt;

  const [stageStartedAt, setStageStartedAt] = useState(() => Date.now());
  useEffect(() => {
    setStageStartedAt(Date.now());
    // `startedAt` as well as `step`: a resubmit can land while `step` still holds the
    // previous run's value, and without it the new run opens showing the abandoned run's
    // stage clock.
  }, [step, startedAt]);

  const stageElapsed = now - stageStartedAt;

  const activeIndex = Math.max(
    0,
    STAGES.findIndex((stage) => stage.step === step),
  );
  const chips = chipsFor(toolPlan, tools);
  const returned = chips.filter((chip) => chip.state !== 'pending').length;

  return (
    <div className="relative">
      {/* Same glow as HeroBriefingPreview: the loader is the briefing card's skeleton. */}
      <div
        className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-red-600/20 via-transparent to-transparent blur-xl"
        aria-hidden="true"
      />

      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl">
        <div className="h-px w-full overflow-hidden bg-zinc-800" aria-hidden="true">
          <div className="h-px w-1/4 animate-sweep bg-gradient-to-r from-transparent via-f1-red to-transparent motion-reduce:animate-none" />
        </div>

        {/*
          A stacked block, not the `flex items-start justify-between` row this used to be, and the
          restructure is what keeps the display-scale timer from mugging the race name.

          `MegaStat`'s `mid` scale is `clamp(2.5rem, 6vw, 4.5rem)`: at 1440 the `6vw` term is 86.4px
          so it caps at **72px**, and `formatElapsed` produces five to six tabular glyphs — roughly
          250–300px of unbreakable numeral. In the old flex row that width became the item's
          min-content width and the *other* column paid for it; `/teams` has the measured precedent,
          where a mega heading silently shrank its neighbour from ~420px to 203px. `min-w-0` does not
          fix that, it only permits overflow. Giving the stat a full-width row of its own removes the
          competition entirely rather than arbitrating it, so the race name gets the whole
          `max-w-4xl` column back and its `truncate` means what it says. At 390 the clamp floors at
          40px, which was never the problem.
        */}
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-f1-red">
            Generating briefing
          </p>
          <h3 className="truncate font-semibold text-ink">{race || 'Resolving race…'}</h3>
          {/*
            The elapsed timer is `/briefing`'s one numeric callout, so it is the "stat callouts
            render at MegaStat mid scale" line of the spec.

            No `sr-only` "Elapsed" prefix any more, and no `tone`: `MegaStat`'s own `label` renders a
            real, visible `zinc-400` small-caps run immediately above the numeral, so a screen reader
            already reaches "Elapsed" then the value in reading order. Adding the old prefix back
            would announce the word twice.

            The whole `M:SS.d` string is the `value`, deliberately not split into `value="0:12"` +
            `sup=".4"` (the branch's `1:12^.909` idiom): the split is a real change to what the
            rendered string is, and `formatElapsed`'s output is asserted verbatim by the suite that
            guards this panel. A string `value` also means no count-up spring runs — right, for a
            clock that is already counting on its own.
          */}
          <MegaStat value={formatElapsed(elapsed)} label="Elapsed" scale="mid" className="mt-3" />
        </div>

        <ol className="px-5 py-4" aria-hidden="true">
          {STAGES.map(({ step: stageStep, label }, i) => {
            const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
            const isLast = i === STAGES.length - 1;

            return (
              <li key={stageStep} data-state={state} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      state === 'done' && 'border-green-500/40 bg-green-500/10',
                      state === 'active' && 'border-f1-red/60 bg-f1-red/10',
                      state === 'pending' && 'border-zinc-800',
                    )}
                  >
                    {state === 'done' && <Check className="h-3 w-3 text-green-400" />}
                    {state === 'active' && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-f1-red motion-reduce:animate-none" />
                    )}
                  </span>
                  {!isLast && (
                    <span
                      className={cn(
                        'w-px flex-1',
                        state === 'done'
                          ? 'bg-gradient-to-b from-f1-red/40 via-zinc-800 to-transparent'
                          : 'bg-zinc-800',
                      )}
                    />
                  )}
                </div>
                <div className={cn(!isLast && 'pb-4')}>
                  {/* A pending stage used to be `zinc-600` — 2.60:1 on this page's backdrop, and it
                      names a real upcoming stage rather than decorating one, so dimness was not
                      free. `zinc-400` (6.24:1) is the branch floor and every state now sits on or
                      above it; "not yet reached" is carried by the marker shape (empty ring vs
                      check vs pulsing dot) and by `data-state`, which is the channel that was
                      always meant to be authoritative. The marker *colours* are deliberately left
                      alone: the done ring composites to about 2.5:1, so lifting the pending ring to
                      the 3:1 non-text bar would make the un-reached stage the brightest mark in the
                      column and invert the hierarchy. */}
                  <p
                    className={cn(
                      'text-sm',
                      state === 'done' && 'text-zinc-400',
                      state === 'active' && 'font-medium text-white',
                      state === 'pending' && 'text-zinc-400',
                    )}
                  >
                    {label}
                  </p>
                  {state === 'active' && (
                    <>
                      {/* zinc-400, not the zinc-500 these two shipped at: at 11px they are small
                          text held to 4.5:1, and zinc-500 measures 4.11:1 on bare base and 3.32:1
                          once the page's topo texture lightens the backdrop to rgb(33, 33, 36). */}
                      {stageStep === 'gathering' && (
                        <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400">
                          {toolPlan.length > 0
                            ? `${returned} of ${toolPlan.length} tools returned`
                            : `${returned} ${returned === 1 ? 'tool' : 'tools'} returned`}
                        </p>
                      )}
                      {stageElapsed >= STAGE_HINT_AFTER_MS && (
                        <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400">
                          {Math.floor(stageElapsed / 1000)}s in this stage
                        </p>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {chips.length > 0 && (
          <div className="border-t border-zinc-800 bg-zinc-950/50 px-5 py-3">
            {/* zinc-400 for the same reason as the sub-lines above: a 10px kicker is small text and
                zinc-500 does not clear 4.5:1 anywhere on this page. */}
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Agent tool trace
            </p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
              {chips.map(({ tool, state }) => (
                <li key={tool} data-state={state} className="flex items-center gap-2">
                  {/* Shape carries the failure signal, colour only reinforces it: a
                      colour-blind reader still sees the dot become a cross. The wrapper
                      is a fixed footprint so no state reflows the two-column grid. */}
                  <span
                    className="flex h-3 w-3 shrink-0 items-center justify-center"
                    aria-hidden="true"
                  >
                    {state === 'ok' && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                    {state === 'failed' && (
                      <span className="text-xs font-bold leading-none text-red-500">×</span>
                    )}
                    {state === 'pending' && (
                      <span className="h-1.5 w-1.5 rounded-full border border-zinc-700" />
                    )}
                  </span>
                  {/* A pending chip names a tool the agent is about to run, which is information,
                      so it cannot be dimmed below the floor either — `zinc-600` measured 2.60:1.
                      Every chip label is now `zinc-400` and the hollow-vs-filled dot above, plus
                      `data-state`, carries which have landed. */}
                  <span className="truncate text-[11px] text-zinc-400">
                    {toolLabel(tool)}
                    {state === 'failed' && <span className="sr-only"> failed</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
