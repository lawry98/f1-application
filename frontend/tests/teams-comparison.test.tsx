import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { TEAMS } from '@/data/teams-data';
import { TeamsComparison } from '@/components/teams/teams-comparison';

function renderComparison(onSelectTeam = vi.fn()) {
  render(
    <TeamsComparison
      teams={TEAMS}
      activeTeamId={TEAMS[0]!.id}
      reducedMotion
      onSelectTeam={onSelectTeam}
    />,
  );
  return { onSelectTeam };
}

/** Row order of the ranking list, by team short name. */
function rankedNames() {
  return within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('TeamsComparison', () => {
  it('ranks every team on the selected measure', () => {
    renderComparison();

    const names = rankedNames();
    expect(names).toHaveLength(TEAMS.length);
    // Default measure is constructors' titles; Ferrari has the most.
    expect(names[0]).toBe('Ferrari');
  });

  it('re-ranks when the measure changes', () => {
    renderComparison();

    fireEvent.click(screen.getByRole('button', { name: 'Power unit share' }));

    expect(screen.getByRole('button', { name: 'Power unit share' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Mercedes supplies three teams — more than any other manufacturer.
    expect(rankedNames()[0]).toBe('Mercedes');
  });

  it('offers only the measures the dataset can support', () => {
    renderComparison();

    const measures = within(screen.getByRole('group', { name: 'Ranking measure' })).getAllByRole(
      'button',
    );
    expect(measures.map((m) => m.textContent)).toEqual([
      "Constructors' titles",
      'Seasons on the grid',
      'Power unit share',
    ]);
  });

  it('links each row to its section instead of faking a link', () => {
    const { onSelectTeam } = renderComparison();

    const ferrari = screen.getByRole('link', { name: 'Ferrari' });
    expect(ferrari).toHaveAttribute('href', '#team-ferrari');

    fireEvent.click(ferrari);
    expect(onSelectTeam).toHaveBeenCalledWith('ferrari');
  });

  it('builds a head-to-head table from the teams you pin', () => {
    renderComparison();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compare Ferrari' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare McLaren' }));

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Ferrari' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Power unit' })).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3); // label column + 2 teams
  });

  it('drops rows the pinned teams have no data for', () => {
    renderComparison();
    fireEvent.click(screen.getByRole('button', { name: 'Compare Ferrari' }));

    // No standings source ships with the dataset, so those rows are omitted rather than dashed.
    expect(screen.queryByRole('rowheader', { name: /standing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: /points/ })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: "Constructors' titles" })).toBeInTheDocument();
  });

  it('caps the comparison at three teams, dropping the oldest pick', () => {
    renderComparison();

    ['Ferrari', 'McLaren', 'Williams', 'Alpine'].forEach((name) =>
      fireEvent.click(screen.getByRole('button', { name: `Compare ${name}` })),
    );

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).queryByRole('columnheader', { name: 'Ferrari' })).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Alpine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare Alpine' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
