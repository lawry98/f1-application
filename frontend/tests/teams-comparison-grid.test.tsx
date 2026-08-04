import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import { TeamsComparisonGrid } from '@/components/teams/teams-comparison-grid';
import { TEAMS } from '@/data/teams-data';

function renderGrid(onScrollToTeam = vi.fn(), reducedMotion = false) {
  render(
    <TeamsComparisonGrid
      teams={TEAMS}
      activeTeamId="ferrari"
      reducedMotion={reducedMotion}
      onScrollToTeam={onScrollToTeam}
    />,
  );
}

function rowNames() {
  return screen.getAllByRole('button', { name: /jump to /i }).map((b) =>
    b.getAttribute('aria-label'),
  );
}

describe('TeamsComparisonGrid', () => {
  it('ranks by points by default, leader first', () => {
    renderGrid();
    expect(rowNames()[0]).toMatch(/Mercedes/);
    expect(rowNames()[10]).toMatch(/Cadillac/);
  });

  it('re-sorts by championships when the Titles tab is chosen', () => {
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    // Ferrari has 16 championships, more than Mercedes' 8.
    expect(rowNames()[0]).toMatch(/Ferrari/);
  });

  it('re-sorts by debut year when the Since tab is chosen', () => {
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Since' }));
    expect(rowNames()[0]).toMatch(/Ferrari/); // 1950, the oldest entry
  });

  it('scales each bar against the leader', () => {
    renderGrid();
    const ferrariRow = screen.getByRole('button', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    // 307 / 379 ≈ 0.81
    expect(bar).toHaveStyle({ transform: 'scaleX(0.81)' });
  });

  it('scrolls to the team whose row is clicked', () => {
    const onScrollToTeam = vi.fn();
    renderGrid(onScrollToTeam);
    fireEvent.click(screen.getByRole('button', { name: /jump to McLaren/i }));
    expect(onScrollToTeam).toHaveBeenCalledWith('mclaren');
  });

  it('dates its own numbers', () => {
    renderGrid();
    expect(screen.getByText(/Round 11/)).toBeInTheDocument();
  });

  it('drops the bar-fill transition under reduced motion', () => {
    renderGrid(vi.fn(), true);
    const ferrariRow = screen.getByRole('button', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    expect(bar.className).not.toMatch(/transition-transform/);
  });
});
