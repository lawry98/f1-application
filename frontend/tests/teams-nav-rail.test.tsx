import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { TEAMS } from '@/data/teams-data';

/** Mirrors the local `monogram()` helper in teams-nav-rail.tsx. */
function expectedMonogram(shortName: string): string {
  return shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
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
      expect(screen.getByText(expectedMonogram(team.shortName))).toBeInTheDocument();
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
