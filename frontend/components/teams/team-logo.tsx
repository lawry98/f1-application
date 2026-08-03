'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type Team } from '@/data/teams-data';

/**
 * How many times `size` a logo's rendered width may reach before it is clamped.
 *
 * Real team marks are horizontal lockups, not squares — the committed set runs from 0.91:1
 * (Mercedes) to 9.48:1 (the Aston Martin wordmark). Letting width run free is the whole
 * point, but unbounded it would push a 9.48:1 wordmark to 455px beside a 48px sibling and
 * tear a nav rail open, so the box stops at 4:1 and `object-contain` letterboxes the rest.
 */
const MAX_ASPECT_RATIO = 4;

interface TeamLogoProps {
  team: Team;
  /**
   * Rendered *height* in px. Width follows the logo's natural aspect ratio up to
   * `maxWidth`; only the monogram fallback is square.
   */
  size: number;
  /**
   * Widest the logo box may get, in px. Defaults to `size * 4`. Pass an explicit value
   * where the container is narrower than that — a 200px rail, say — since this lands as an
   * inline style and a `max-w-*` class in `className` would lose to it.
   */
  maxWidth?: number;
  className?: string;
}

/** First three letters of the short name, spaces and punctuation dropped. */
function monogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * A team's logo, falling back to a colour-filled monogram tile.
 *
 * `logo` is always a populated path, so the fallback is driven purely by the image
 * failing to load — an asset that has not been fetched yet behaves exactly like a 404.
 *
 * The failure is tracked by team id, not a bare boolean: a persistent instance (e.g. a
 * sticky rail whose `team` prop swaps without remounting) must re-attempt the new team's
 * image rather than latching on whichever team failed first. Consumers need no `key` for
 * this correctness — it holds across prop changes on the same instance.
 *
 * `size` is a height, not an edge. Pinning both axes to one number squares the box, and
 * `object-contain` then scales a wide lockup down until it fits the *width* — a 6.78:1
 * McLaren mark in a 48px square draws 7px tall, which is less legible than the monogram it
 * was meant to replace. Height-driven sizing is the only reason sourcing real logos pays
 * off, so it is covered by a test.
 */
export function TeamLogo({
  team,
  size,
  maxWidth = size * MAX_ASPECT_RATIO,
  className,
}: TeamLogoProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === team.id;

  if (failed) {
    // The fallback stays square on purpose: it is a monogram tile, not a wordmark.
    return (
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded font-black leading-none',
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: team.color,
          color: team.textOnColor === 'black' ? '#000000' : '#ffffff',
          fontSize: size * 0.3,
        }}
      >
        {monogram(team.shortName)}
      </div>
    );
  }

  return (
    <Image
      src={team.logo}
      alt={`${team.shortName} logo`}
      // Intrinsic hints only — the rendered box comes from `style` below.
      width={size}
      height={size}
      onError={() => setFailedId(team.id)}
      className={cn('flex-shrink-0 object-contain', className)}
      style={{ height: size, width: 'auto', maxWidth }}
    />
  );
}
