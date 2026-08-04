import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsHero } from '@/components/teams/teams-hero';
import { TEAMS } from '@/data/teams-data';

describe('TeamsHero', () => {
  it('renders one column per constructor', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /jump to /i })).toHaveLength(TEAMS.length);
  });

  it('keeps the title', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getByText(/the grid/i)).toBeInTheDocument();
  });

  it('scrolls to the team whose column is clicked', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsHero onSelectTeam={onSelectTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /jump to Ferrari/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('ferrari');
  });

  it('exposes columns as real buttons so they are keyboard reachable', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    for (const button of screen.getAllByRole('button', { name: /jump to /i })) {
      expect(button.tagName).toBe('BUTTON');
    }
  });
});
