import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

import { TeamsComparisonGrid } from '@/components/teams/teams-comparison-grid';
import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function renderGrid(onSelectTeam = vi.fn(), reducedMotion = false) {
  return render(
    <TeamsComparisonGrid
      teams={TEAMS}
      activeTeamId="ferrari"
      reducedMotion={reducedMotion}
      onSelectTeam={onSelectTeam}
    />,
  );
}

function rowNames() {
  return screen
    .getAllByRole('link', { name: /jump to /i })
    .map((el) => el.getAttribute('aria-label'));
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
    const ferrariRow = screen.getByRole('link', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    // 307 / 379 ≈ 0.81
    expect(bar).toHaveStyle({ transform: 'scaleX(0.81)' });
  });

  it('links each row to its team’s section', () => {
    renderGrid();
    expect(screen.getByRole('link', { name: /jump to McLaren/i })).toHaveAttribute(
      'href',
      '#team-mclaren',
    );
  });

  it('claims the clicked team without preventing navigation', () => {
    const onSelectTeam = vi.fn();
    renderGrid(onSelectTeam);
    const link = screen.getByRole('link', { name: /jump to McLaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    expect(event.defaultPrevented).toBe(false);
  });

  it('dates its own numbers', () => {
    renderGrid();
    expect(screen.getByText(/Round 11/)).toBeInTheDocument();
  });

  // The link's aria-label overrides all of its inner text, so before this the rank, the bar
  // and the points were sighted-only: eleven identical "Jump to <team>, link" announcements
  // in a section whose entire content is the standings.
  it('announces each row’s rank and points, not just the team name', () => {
    renderGrid();
    const mercedes = screen.getByRole('link', { name: /jump to Mercedes/i });
    const name = mercedes.getAttribute('aria-label')!;
    expect(name).toMatch(/1 of 11/);
    expect(name).toMatch(/379 points/);
  });

  it('announces the metric the chosen sort actually displays', () => {
    renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByRole('link', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /16 championships/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Since' }));
    expect(screen.getByRole('link', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /first entered 1950/,
    );
  });

  it('renumbers the announced rank when the sort changes', () => {
    renderGrid();
    // Ferrari is 2nd on points and 1st on championships.
    expect(screen.getByRole('link', { name: /jump to Ferrari/i })).toHaveAccessibleName(
      /2 of 11/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByRole('link', { name: /jump to Ferrari/i })).toHaveAccessibleName(
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
    const ferrariRow = screen.getByRole('link', { name: /jump to Ferrari/i });
    const bar = within(ferrariRow).getByTestId('bar-fill');
    expect(bar.className).not.toMatch(/transition-transform/);
  });

  // Brief item 2. This numeral is neither the championship position nor the page's running order —
  // it is the rank under whichever sort is active, and it moves when the tab changes. Saying
  // so is the difference between a third mystery number and a labelled one.
  it('labels its leading numeral as the rank of the active sort', () => {
    renderGrid();
    expect(screen.getByText(/by points/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Titles' }));
    expect(screen.getByText(/by titles/i)).toBeInTheDocument();
  });

  // The grid carried both failing rungs: `zinc-500` section labels at 4.12:1 and `zinc-600`
  // rank numerals at 2.57:1 — the same 2.57 the nav rail's subheader measured.
  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderGrid();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  describe('the two-slot comparison', () => {
    it('shows no tray until two constructors are chosen', () => {
      renderGrid();
      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument();
    });

    it('says what it is waiting for after one pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      expect(screen.getByText(/select one more/i)).toBeInTheDocument();
    });

    it('opens the tray on the second pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));

      const tray = screen.getByTestId('compare-tray');
      expect(within(tray).getByText('Power Unit')).toBeInTheDocument();
      expect(within(tray).getByText(TEAM_MAP['ferrari']!.base)).toBeInTheDocument();
    });

    it('reports each row’s slot state to assistive tech', () => {
      renderGrid();
      const mercedes = screen.getByRole('button', { name: /compare Mercedes/i });
      expect(mercedes).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(mercedes);
      expect(mercedes).toHaveAttribute('aria-pressed', 'true');
    });

    // Async, and the disappearance is awaited: TeamsCompareTray (Task 2, unchangeable here)
    // carries its own `exit` transition — a real `{ type: 'spring', duration: 0.3, bounce: 0 }`
    // — and AnimatePresence holds the outgoing tray mounted in jsdom for that real elapsed time
    // before removing it. A synchronous assertion right after the click sees the tray still
    // there; `waitFor` is the correct way to observe an animated unmount, not a weaker check.
    it('lets a chosen constructor be unchosen', async () => {
      renderGrid();
      const mercedes = screen.getByRole('button', { name: /compare Mercedes/i });
      fireEvent.click(mercedes);
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      expect(screen.getByTestId('compare-tray')).toBeInTheDocument();

      fireEvent.click(mercedes);
      await waitFor(() => expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument());
      expect(mercedes).toHaveAttribute('aria-pressed', 'false');
    });

    // The cap is two. A third pick drops the older of the two rather than being silently
    // ignored — a control that visibly does nothing is worse than one that does something
    // predictable.
    it('caps the comparison at two, dropping the older pick', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare McLaren/i }));

      expect(screen.getByRole('button', { name: /compare Mercedes/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: /compare Ferrari/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /compare McLaren/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps the picks in the order they were made', () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));

      const row = screen.getByTestId('compare-row-championship');
      expect(within(row).getByTestId('compare-value-0').textContent).toMatch(/Ferrari/);
      expect(within(row).getByTestId('compare-value-1').textContent).toMatch(/Mercedes/);
    });

    // See the note on 'lets a chosen constructor be unchosen' — the tray's own exit transition
    // means jsdom needs `waitFor`, not an immediate assertion, to observe the unmount.
    it('clears both slots from the tray', async () => {
      renderGrid();
      fireEvent.click(screen.getByRole('button', { name: /compare Mercedes/i }));
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      fireEvent.click(screen.getByRole('button', { name: /clear comparison/i }));

      await waitFor(() => expect(screen.queryByTestId('compare-tray')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: /compare Mercedes/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    // The row's anchor and its compare toggle are siblings, not nested. A button inside an
    // anchor is invalid HTML and the browser's behaviour on click is undefined.
    it('keeps the compare toggle outside the jump link', () => {
      renderGrid();
      const link = screen.getByRole('link', { name: /jump to Ferrari/i });
      expect(link.querySelector('button')).toBeNull();
    });

    it('does not navigate when a constructor is picked for comparison', () => {
      const onSelectTeam = vi.fn();
      renderGrid(onSelectTeam);
      fireEvent.click(screen.getByRole('button', { name: /compare Ferrari/i }));
      expect(onSelectTeam).not.toHaveBeenCalled();
    });

    // The sort tabs stay at three. The tray is what answers the brief's demand that power unit,
    // base and drivers be comparable; adding tabs for them would add controls without adding
    // information.
    it('still offers exactly three orderings', () => {
      renderGrid();
      for (const label of ['Points', 'Titles', 'Since']) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
      const tabs = screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') !== null && !/compare /i.test(b.getAttribute('aria-label') ?? ''));
      expect(tabs).toHaveLength(3);
    });
  });
});
