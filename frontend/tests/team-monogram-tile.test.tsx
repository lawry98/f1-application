import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamMonogramTile, monogram } from '@/components/teams/team-monogram-tile';
import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { contrastRatio, MIN_CONTRAST, onColor } from '@/lib/team-utils';

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderTile(id: string, size?: number) {
  const team = TEAM_MAP[id]!;
  const { container } = render(<TeamMonogramTile team={team} size={size} />);
  return container.querySelector<HTMLElement>('[role="img"]')!;
}

describe('TeamMonogramTile', () => {
  it('renders the three-letter monogram for the team', () => {
    renderTile('racing-bulls');
    expect(screen.getByText(monogram('Racing Bulls'))).toBeInTheDocument();
  });

  // The fourth instance of this branch's bug class, and the one a pixel probe cannot see: the
  // tile *is* its own background, so hiding the glyphs to read what is behind them hides the
  // fill too. axe found it — white bold 8px on Alpine's #0090ff at 3.26:1.
  //
  // The cause is that the glyph colour came from the hand-authored `textOnColor` field rather
  // than from the fill it actually sits on. `onColor` picks whichever of black or white reads
  // better and is already asserted to clear AA on all eleven fills, so this is the same
  // "derive it from the surface, do not author it" rule the rest of the colour layer follows.
  it('clears WCAG AA against its own fill for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const tile = renderTile(team.id);
      const glyph = rgbToHex(tile.style.color);
      expect(
        contrastRatio(glyph, team.color),
        `${team.shortName} monogram ${glyph} on ${team.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('derives the glyph colour from the fill rather than from an authored field', () => {
    for (const team of TEAMS) {
      const tile = renderTile(team.id);
      expect(rgbToHex(tile.style.color), `${team.shortName}`).toBe(onColor(team.color));
    }
  });

  // Alpine is the case that failed: `#0090ff` takes black at 6.77:1, where white manages 3.26:1.
  it('puts black on Alpine’s blue, which white cannot carry', () => {
    const alpine = TEAM_MAP['alpine']!;
    expect(alpine.color).toBe('#0090ff');
    expect(contrastRatio('#ffffff', alpine.color)).toBeLessThan(MIN_CONTRAST);
    expect(rgbToHex(renderTile('alpine').style.color)).toBe('#000000');
  });

  it('keeps the fill the true livery, since the tile is a brand mark', () => {
    for (const team of TEAMS) {
      expect(rgbToHex(renderTile(team.id).style.backgroundColor), `${team.shortName}`).toBe(
        team.color,
      );
    }
  });
});
