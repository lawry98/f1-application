'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
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

interface BriefingLoaderProps {
  /** The resolved race name; empty until the `race_info` event lands. */
  race: string;
  /** The live graph stage. Empty or unrecognised opens on the first stage. */
  step: string;
  /** The backend's own status prose, for the live region. */
  statusMessage: string;
  /** Tools that have returned so far, in arrival order. */
  tools: ToolResult[];
  /** Epoch ms the current request began; the elapsed timer's baseline. */
  startedAt: number;
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
 * Milliseconds since `startedAt`, reread on an interval.
 *
 * The baseline is a prop rather than mount time on purpose: overlapping runs do not
 * remount this component, so a mount-based clock would carry the abandoned run's elapsed
 * time into the new one.
 */
function useElapsed(startedAt: number): number {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const tick = (): void => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

export function BriefingLoader({
  race,
  step,
  statusMessage,
  tools,
  startedAt,
}: BriefingLoaderProps) {
  const elapsed = useElapsed(startedAt);
  const activeIndex = Math.max(
    0,
    STAGES.findIndex((stage) => stage.step === step),
  );

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

        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-f1-red">
              Generating briefing
            </p>
            <h3 className="truncate font-semibold text-white">{race || 'Resolving race…'}</h3>
          </div>
          <p className="shrink-0 pt-1 font-mono text-sm tabular-nums text-zinc-400">
            <span className="sr-only">Elapsed </span>
            {formatElapsed(elapsed)}
          </p>
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
                        state === 'done' ? 'bg-f1-red/40' : 'bg-zinc-800',
                      )}
                    />
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm',
                    !isLast && 'pb-4',
                    state === 'done' && 'text-zinc-400',
                    state === 'active' && 'font-medium text-white',
                    state === 'pending' && 'text-zinc-600',
                  )}
                >
                  {label}
                </p>
              </li>
            );
          })}
        </ol>

        {tools.length > 0 && (
          <div className="border-t border-zinc-800 bg-zinc-950/50 px-5 py-3">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Agent tool trace
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {tools.map((tool) => (
                <div key={tool.tool} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      tool.success ? 'bg-green-500' : 'bg-red-500',
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate text-[11px] text-zinc-400">
                    {toolLabel(tool.tool)}
                    {!tool.success && <span className="sr-only"> failed</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
