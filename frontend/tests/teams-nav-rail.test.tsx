import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';

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
});
