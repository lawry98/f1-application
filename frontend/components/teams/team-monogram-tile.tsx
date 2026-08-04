import { type Team } from '@/data/teams-data';

/** First three alphabetic characters of a team's short name, uppercased. */
export function monogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

interface TeamMonogramTileProps {
  team: Team;
  size?: number;
}

/**
 * Uniform square colour tile carrying a three-letter monogram — a logo mark for surfaces where
 * every team must render at the same size.
 *
 * Real wordmarks (`TeamLogo`) range from ~1:1 (Mercedes) to 9.48:1 (Aston Martin). Object-fit
 * into a shared box at a small height either leaves near-invisible slivers (Aston Martin renders
 * ~4px tall at 22px) or forces the box open across a wide row — neither reads as a uniform set.
 * A flat monogram tile keeps every row the same size and legible, including `racing-bulls`,
 * which has no logo file at all and would otherwise be the only fallback square in a list of
 * wordmarks. Full logos still belong on wider surfaces (the sticky panel, the hero) via
 * `TeamLogo` — this tile is for compact, uniform rows on purpose.
 */
export function TeamMonogramTile({ team, size = 22 }: TeamMonogramTileProps) {
  return (
    <div
      className="relative z-10 flex flex-shrink-0 items-center justify-center rounded text-[8px] font-black leading-none"
      style={{
        width: size,
        height: size,
        backgroundColor: team.color,
        color: team.textOnColor === 'black' ? '#000000' : '#ffffff',
      }}
    >
      {monogram(team.shortName)}
    </div>
  );
}
