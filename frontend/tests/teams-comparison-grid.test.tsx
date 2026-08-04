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

  // The button's aria-label overrides all of its inner text, so before this the rank, the bar
  // and the points were sighted-only: eleven identical "Jump to <team>, button" announcements
  // in a section whose entire content is the standings.
  it('announces each row’s rank and points, not just the team name', () => {
    renderGrid();
    const mercedes = screen.getByRole('button', { name: /jump to Mercedes/i });
    const name = mercedes.getAttribute('aria-label')!;
    expect(name).toMatch(/1 of 11/);
    expect(name).toMatch(/379 points/);
  });

  it('announces the metric the chosen sort actually displays', () => {
    renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByRole('button', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /16 championships/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Since' }));
    expect(screen.getByRole('button', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /first entered 1950/,
    );
  });

  it('renumbers the announced rank when the sort changes', () => {
    renderGrid();
    // Ferrari is 2nd on points and 1st on championships.
    expect(screen.getByRole('button', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /2 of 11/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByRole('button', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /1 of 11/,
    );
  });

  it('still identifies every row by team name so the section stays skimmable', () => {
    renderGrid();
    const names = rowNames();
    expect(names).toHaveLength(TEAMS.length);
    for (const team of TEAMS) {
      expect(names.some((n) => n?.includes(team.shortName))).toBe(true);
    }
  });

  it('drops the bar-fill transition under reduced motion', () => {
    renderGrid(vi.fn(), true);
    const ferrariRow = screen.getByRole('button', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    expect(bar.className).not.toMatch(/transition-transform/);
  });
});
