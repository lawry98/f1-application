import { type Team } from '@/data/teams-data';

/** Returns inline style + extra className for a team-color-filled CTA button. */
export function teamColorButtonStyle(team: Team) {
  const isWhite = team.color === '#ffffff';
  return {
    style: {
      backgroundColor: isWhite ? '#27272a' : team.color,
      color: isWhite ? '#ffffff' : team.textOnColor === 'black' ? '#000000' : '#ffffff',
      borderColor: isWhite ? '#52525b' : 'transparent',
    },
    className: isWhite ? 'border' : '',
  };
}

/** The season the page describes. Used to derive elapsed seasons from a debut year. */
const CURRENT_SEASON = 2026;

/** Seasons elapsed since a constructor's debut, for the rail's derived stat cell. */
export function seasonsSince(firstEntry: number): number {
  return CURRENT_SEASON - firstEntry;
}

/**
 * Wash colour for a driver portrait. Mirrors the `#ffffff` special-case that
 * `teamColorButtonStyle` already establishes: a white wash over zinc-950 erases the
 * portrait entirely, so Haas gets a neutral tint and leans on a white keyline instead.
 */
export function duotoneFor(team: Team): { color: string; opacity: number; keyline: string } {
  const isWhite = team.color === '#ffffff';
  return {
    color: isWhite ? '#52525b' : team.color,
    opacity: isWhite ? 0.35 : 0.45,
    keyline: isWhite ? '#ffffff' : team.color,
  };
}
