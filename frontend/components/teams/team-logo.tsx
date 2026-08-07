'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type Team } from '@/data/teams-data';
import { readableOnDark } from '@/lib/team-utils';
import { TeamMonogramTile } from './team-monogram-tile';

/**
 * How many times `size` a logo's rendered width may reach before it is clamped.
 *
 * Real team marks are horizontal lockups, not squares — the committed set runs from 0.91:1
 * (Mercedes) to 9.48:1 (the Aston Martin wordmark). Letting width run free is the whole
 * point, but unbounded it would push a 9.48:1 wordmark to 455px beside a 48px sibling and
 * tear a nav rail open, so the box stops at 4:1 and `object-contain` letterboxes the rest.
 */
const MAX_ASPECT_RATIO = 4;

/**
 * Smallest `size` at which a failed logo falls back to a styled text wordmark instead of the
 * square monogram tile.
 *
 * `TeamLogo`'s two call sites that want a wordmark pass 56 (`sticky-team-panel`'s lockup) and
 * 30 (`teams-hero`'s hover reveal); everywhere else that shows a team mark — the 22px nav rail,
 * the 22px comparison grid, `team-section`'s 20px byline — renders `TeamMonogramTile` directly
 * and never reaches this component at all. 30 is therefore the lowest value that must clear the
 * bar, and nothing between 22 and 30 currently exists to argue for a tighter number: a text
 * fallback below ~30px has too little room to stay legible as more than a handful of letters,
 * which is exactly what the monogram tile is for.
 */
const WORDMARK_FALLBACK_MIN_SIZE = 30;

/**
 * Fraction of `size` used as the wordmark fallback's font size.
 *
 * Lower than `TeamMonogramTile`'s 0.36 glyph ratio: a three-letter monogram fills most of its
 * square, but a full short name ("Racing Bulls") is several characters wide, so a comparable
 * ratio would run the text past `maxWidth` inside the box heights these call sites actually use.
 * 0.42 keeps two-word names inside the default `maxWidth` (`size * MAX_ASPECT_RATIO`) at both
 * 56 and 30 while still reading as deliberate type, not a caption.
 */
const WORDMARK_FONT_RATIO = 0.42;

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
    // Above the threshold the caller wants a wordmark-shaped box (the sticky panel's lockup,
    // the hero's hover reveal) — a monogram square there reads as a broken image next to real
    // wordmarks like McLaren's or Ferrari's. Below it, stay exactly as before: the square
    // monogram tile, sharing glyph scale and accessible name with `TeamMonogramTile` by being it.
    if (size >= WORDMARK_FALLBACK_MIN_SIZE) {
      return (
        <span
          role="img"
          aria-label={`${team.shortName} logo`}
          className={cn(
            'inline-flex flex-shrink-0 items-center justify-center truncate',
            'font-black uppercase leading-none tracking-tight',
            className,
          )}
          style={{
            height: size,
            maxWidth,
            fontSize: Math.round(size * WORDMARK_FONT_RATIO),
            color: readableOnDark(team.color),
          }}
        >
          {team.shortName}
        </span>
      );
    }
    return <TeamMonogramTile team={team} size={size} className={className} />;
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
