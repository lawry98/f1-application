'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { duotoneFor } from '@/lib/team-utils';
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

      {/* Dissolve into the page so the portrait has no hard bottom edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"
      />

      {/* Ghost number — the fallback card's signature element, kept in both states. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1 select-none font-black leading-none text-white"
        style={{ opacity: failed ? 0.06 : 0.45, fontSize: failed ? '5rem' : '2.5rem' }}
      >
        {driver.number}
      </span>

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: duotone.keyline }}
        >
          {driver.nationality}
        </p>
        <p className="mt-0.5 text-sm font-bold leading-tight text-white">{driver.name}</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">
          {driver.shortCode}
        </p>
      </div>

      {/* Screen-reader-visible number; the ghost numeral above is decorative. */}
      <span className="sr-only">Car number {driver.number}</span>
    </div>
  );
}
