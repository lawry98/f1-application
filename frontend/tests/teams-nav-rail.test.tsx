import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { monogram } from '@/components/teams/team-monogram-tile';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { TEAMS } from '@/data/teams-data';

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('TeamsNavRail', () => {
  it('shows position and points for each team on desktop', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} />);
    expect(screen.getByText('P1 · 379 PTS')).toBeInTheDocument();
    expect(screen.getByText('P2 · 307 PTS')).toBeInTheDocument();
  });

  it('selects the team that was clicked', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={onSelectTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /mclaren/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
  });

  it('marks only the active team as current', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} />);
    const current = screen.getAllByRole('button', { current: true });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
  });

  it('drops points but keeps position in the mobile pills', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} mobile />);
    expect(screen.queryByText('P1 · 379 PTS')).not.toBeInTheDocument();
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('renders a uniform monogram tile for every team, including racing-bulls', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={vi.fn()} />);
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(screen.getByText(monogram(team.shortName))).toBeInTheDocument();
    }
  });

  // The active row's `P4 · 177 PTS` line is 9px in the team colour. Seven of eleven liveries
  // fail 4.5:1 against zinc-950 raw, so the row that draws the eye hardest was the one whose
  // standing could not be read. Asserted for every team as the active one.
  it('keeps the active row’s standings line above AA for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = render(<TeamsNavRail activeTeamId={team.id} onSelectTeam={vi.fn()} />);
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), DARK_BG),
        `${team.shortName} standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  it('sets the progress track to a sliver on the first team and full on the last', () => {
    const first = TEAMS.at(0);
    const last = TEAMS.at(-1);
    if (!first || !last) throw new Error('TEAMS must not be empty');

    const { container: firstContainer } = render(
      <TeamsNavRail activeTeamId={first.id} onSelectTeam={vi.fn()} />,
    );
    const firstFill = firstContainer.querySelector('.origin-top') as HTMLElement;
    expect(firstFill.style.transform).toBe(`scaleY(${1 / TEAMS.length})`);

    const { container: lastContainer } = render(
      <TeamsNavRail activeTeamId={last.id} onSelectTeam={vi.fn()} />,
    );
    const lastFill = lastContainer.querySelector('.origin-top') as HTMLElement;
    expect(lastFill.style.transform).toBe('scaleY(1)');
  });
});
