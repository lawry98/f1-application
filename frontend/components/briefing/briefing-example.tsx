'use client';

import Link from 'next/link';
import type { BriefingExampleSummary } from '@/data/briefing-examples';
import { useBriefingExample } from '@/hooks/use-briefing-example';
import { exampleHref, formatCapturedDate } from '@/lib/briefing-examples';
import { cn } from '@/lib/utils';
import { BriefingCard } from './briefing-card';
import { BriefingCircuitBand } from './briefing-circuit-band';
import { ToolTrace } from './tool-trace';

export interface SavedExampleOfferProps {
  example: BriefingExampleSummary;
  /** The ring for the surface the offer sits on — see `lib/focus.ts`. */
  ringClassName: string;
  className?: string;
}

/**
 * "Read the saved example (captured 1 Oct 2026)" — the way out of a run that could not finish.
 *
 * A link, not a button: it changes what the page shows to something with its own URL
 * (`?example=`), and Back returns to the notice. `scroll={false}` because the example replaces
 * the box the visitor is looking at, in the same place.
 *
 * Its own **opaque** `bg-zinc-800` fill means the text is judged against that one colour wherever
 * the offer sits — inside the neutral notice box or the red-tinted error box — and `zinc-100` on
 * it is 13.6:1. Fixed body size: never a breakpoint `text-base`, which in this theme is a colour.
 */
export function SavedExampleOffer({ example, ringClassName, className }: SavedExampleOfferProps) {
  return (
    <Link
      href={exampleHref(example.id)}
      scroll={false}
      className={cn(
        'inline-flex items-center rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5',
        'text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700',
        ringClassName,
        className,
      )}
    >
      Read the saved example (captured {formatCapturedDate(example.captured_at)})
    </Link>
  );
}

/**
 * A saved example, shown where a live briefing would be: the same circuit band, the same card and
 * the same trace, so it reads as what a briefing looks like — with the card marked, permanently,
 * as not being one.
 */
export function BriefingExampleView({ id }: { id: string }) {
  const { example, status } = useBriefingExample(id);

  if (status === 'loading') {
    // Opaque, the notice box's own fill, so the line is one known composite: zinc-300 on
    // zinc-900, ~12:1.
    return (
      <div className="mb-8 rounded-lg border border-zinc-700 bg-zinc-900 p-4" role="status">
        <p className="text-zinc-300">Loading the saved example…</p>
      </div>
    );
  }

  if (status === 'missing' || example === null) {
    return (
      <div className="mb-8 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <p className="text-zinc-300">This saved example could not be found.</p>
      </div>
    );
  }

  return (
    <>
      <BriefingCircuitBand
        raceInfo={example.race_info}
        round={example.race_info.round}
        className="mb-8"
      />
      <BriefingCard
        race={example.race_info.name}
        briefing={example.briefing.content}
        savedExample={{ capturedAt: example.captured_at }}
      />
      <ToolTrace tools={example.tools} complete />
    </>
  );
}
