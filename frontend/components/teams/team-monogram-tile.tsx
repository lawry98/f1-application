import { cn } from '@/lib/utils';
import { type Team } from '@/data/teams-data';

/** First three alphabetic characters of a team's short name, uppercased. */
export function monogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * Monogram height as a fraction of the tile edge. 0.36 is the ratio the nav rail and the
 * comparison grid already shipped (8px glyphs in a 22px tile); expressing it as a ratio is
 * what makes `size` mean something at every value instead of only at 22.
 */
const GLYPH_RATIO = 0.36;

interface TeamMonogramTileProps {
  team: Team;
  size?: number;
  /**
   * Positioning and stacking belong to the call site, not to the primitive — the nav rail
   * needs `relative z-10` to clear its own absolutely-positioned active highlight, and no
   * other surface does.
   */
  className?: string;
}

/**
 * Uniform square colour tile carrying a three-letter monogram — a logo mark for surfaces where
 * every team must render at the same size, shared across the nav rail, the comparison grid, and
 * any other compact row of teams. It is also `TeamLogo`'s fallback, so the two monogram tiles
 * on the page cannot drift apart.
 *
 * Real wordmarks (`TeamLogo`) range from ~1:1 (Mercedes) to 9.48:1 (Aston Martin). At the small,
 * fixed heights these surfaces use, `object-contain` either letterboxes a wide wordmark into a
 * near-invisible sliver or forces the box open wide enough to break the row's alignment —
 * neither reads as a uniform set. A flat monogram tile keeps every row the same size and
 * legible, including `racing-bulls`, which has no logo file at all and would otherwise be the
 * only fallback square in a list of wordmarks. Full logos still belong on wider surfaces (the
 * sticky panel, the hero's hover reveal) via `TeamLogo` — this tile is for compact, uniform rows
 * on purpose.
 *
 * It carries `role="img"` and the same accessible name as `TeamLogo`'s image branch. Without it
 * a screen reader reads the raw glyphs — `racing-bulls`, which has no logo file, announced as
 * "RAC" and nothing else in the sticky panel, where the team name appears nowhere.
 */
export function TeamMonogramTile({ team, size = 22, className }: TeamMonogramTileProps) {
  return (
    <div
      role="img"
      aria-label={`${team.shortName} logo`}
      className={cn(
        'flex flex-shrink-0 items-center justify-center rounded font-black leading-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: team.color,
        color: team.textOnColor === 'black' ? '#000000' : '#ffffff',
        fontSize: Math.round(size * GLYPH_RATIO),
      }}
    >
      {monogram(team.shortName)}
    </div>
  );
}
