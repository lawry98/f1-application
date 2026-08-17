'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import {
  duotoneFor,
  portraitDissolve,
  portraitScrim,
  PORTRAIT_SCRIM_TEXT_INSET,
} from '@/lib/team-utils';
import { type Driver, type Team } from '@/data/teams-data';

interface DriverPortraitProps {
  driver: Driver;
  team: Team;
  /** Eager-load. Set for the first team so the rail is never blank on arrival. */
  priority?: boolean;
  className?: string;
}

/**
 * A driver headshot washed in the team colour and dissolved into the page.
 *
 * The name plate and ghost number render either way, so a missing headshot degrades
 * to the text-only card the page shipped before rather than to a hole.
 *
 * The failure is tracked by driver id, not a bare boolean: a persistent instance (e.g.
 * the sticky rail whose `driver`/`team` props swap without remounting as the user
 * scrolls) must re-attempt the new driver's image rather than latching on whichever
 * driver failed first. Consumers need no `key` for this correctness — it holds across
 * prop changes on the same instance.
 */
export function DriverPortrait({ driver, team, priority, className }: DriverPortraitProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === driver.id;
  const duotone = duotoneFor(team);

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-gradient-to-b from-zinc-800/70 to-zinc-950',
        className,
      )}
      // A pure-white hairline reads as an edge; a tinted one reads as dirt.
      style={{ outline: '1px solid oklch(1 0 0 / 0.1)', outlineOffset: '-1px' }}
    >
      {!failed && (
        <>
          <Image
            src={driver.headshot}
            alt={driver.name}
            fill
            sizes="(max-width: 1024px) 50vw, 180px"
            priority={priority}
            onError={() => setFailedId(driver.id)}
            className="object-cover object-top"
          />
          {/* Team-colour wash. Sits above the image, below the plate. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 mix-blend-color"
            style={{ backgroundColor: duotone.color, opacity: duotone.opacity }}
          />
        </>
      )}

      {/*
        Dissolve into the page so the portrait has no hard bottom edge — and nothing more than
        that. It used to reach full `zinc-950` at the bottom, which was right while it was the only
        thing there; the caption scrim now covers that same edge at 0.9, and the two composited to
        opaque over the bottom third of every headshot. Its strength is bounded below the scrim's
        in `PORTRAIT_DISSOLVE_ALPHA` so the scrim stays the thing that backs the caption, which is
        what `portraitCaptionBackdrop` claims to describe.
      */}
      <div
        data-testid="portrait-dissolve"
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: portraitDissolve() }}
      />

      {/* Ghost number — the fallback card's signature element, kept in both states. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1 select-none font-black leading-none text-white"
        style={{ opacity: failed ? 0.06 : 0.45, fontSize: failed ? '5rem' : '2.5rem' }}
      >
        {driver.number}
      </span>

      {/*
        The caption's own scrim, and the one thing here that is not a colour decision: these three
        lines sit on a photograph, so what is behind them cannot be known — and two of them, the
        white name and the neutral short code, never pass through the colour layer at all. Over a
        pale race suit the name measured 1.13:1 and the nationality 1.89:1.

        The dissolve gradient above is not this: it peaks at `PORTRAIT_DISSOLVE_ALPHA` (0.6) at the
        very bottom edge and is ~0.4 of that where the first line of text sits, because its job is
        to blend the portrait into the page rather than to back the text. `portraitScrim` is flat at full strength behind
        the text and fades out above it, and `PORTRAIT_SCRIM_TEXT_INSET` is what keeps the text out
        of that fade, where the guarantee stops holding.
      */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 pb-3"
        style={{ background: portraitScrim(), paddingTop: PORTRAIT_SCRIM_TEXT_INSET }}
      >
        <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: duotone.keyline }}>
          {driver.nationality}
        </p>
        <p className="mt-0.5 text-sm font-bold leading-tight text-white">{driver.name}</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">{driver.shortCode}</p>
      </div>

      {/* Screen-reader-visible number; the ghost numeral above is decorative. */}
      <span className="sr-only">Car number {driver.number}</span>
    </div>
  );
}
