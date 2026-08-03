'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type Team } from '@/data/teams-data';

interface TeamLogoProps {
  team: Team;
  /** Rendered edge length in px. Logos are square-boxed. */
  size: number;
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
 */
export function TeamLogo({ team, size, className }: TeamLogoProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === team.id;

  if (failed) {
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
      width={size}
      height={size}
      onError={() => setFailedId(team.id)}
      className={cn('flex-shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
