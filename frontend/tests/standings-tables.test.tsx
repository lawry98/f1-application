import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ConstructorStandingsTable,
  DriverStandingsTable,
} from '@/components/standings/standings-tables';
import { TEAM_MAP } from '@/data/teams-data';
import { formatDriverName } from '@/lib/standings';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';
import { inlineColouredText, restingTextNeutrals } from './zinc';

function bodyRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('tbody > tr'));
}

function rowFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error(`no row contains "${text}"`);
  return row;
}

describe('DriverStandingsTable', () => {
  it('renders every driver the season served — 23 in 2026, not 22', () => {
    // Tsunoda started races as a substitute, and the roster is seeded from every session.
    const { container } = render(<DriverStandingsTable rows={standings2026.drivers} />);

    expect(bodyRows(container)).toHaveLength(23);
  });

  it('renders rows in the order they arrive and never sorts them', () => {
    // Reversed on purpose: no ranking of any field produces this order, so a client-side sort of
    // any kind — points, position, name — would reorder it and fail here. The backend's
    // tie-break is the only ordering the page may show.
    const reversed = [...standings2026.drivers].reverse();
    const { container } = render(<DriverStandingsTable rows={reversed} />);

    const shown = bodyRows(container).map((tr) => tr.firstElementChild?.textContent);
    expect(shown).toEqual(reversed.map((row) => String(row.position)));
  });

  it('shows each driver under the formatted name, with the team as /teams names it', () => {
    render(<DriverStandingsTable rows={standings2026.drivers} />);

    for (const row of standings2026.drivers) {
      expect(screen.getByText(formatDriverName(row.driver))).toBeInTheDocument();
    }
    // "Red Bull Racing" on the wire; "Red Bull" everywhere else in the app.
    expect(within(rowFor('Max Verstappen')).getByText('Red Bull')).toBeInTheDocument();
  });

  it('is a real table with a caption and scoped column headers', () => {
    render(<DriverStandingsTable rows={standings2026.drivers} />);

    const table = screen.getByRole('table', { name: /^drivers' championship/i });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    expect(within(table).getByRole('columnheader', { name: 'Position' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Points' })).toBeInTheDocument();
  });
});

describe('ConstructorStandingsTable', () => {
  it('renders all eleven 2026 constructors, Cadillac on zero included', () => {
    const { container } = render(<ConstructorStandingsTable rows={standings2026.constructors} />);

    expect(bodyRows(container)).toHaveLength(11);
    expect(within(rowFor('Cadillac')).getByText('0')).toBeInTheDocument();
  });

  it("paints every bar in its team's true colour", () => {
    // Decorative, so never lifted for contrast: a "readable" Racing Bulls navy would misreport
    // the livery.
    const { container } = render(<ConstructorStandingsTable rows={standings2026.constructors} />);
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-team-bar]'));

    expect(bars).toHaveLength(11);
    for (const bar of bars) {
      const team = TEAM_MAP[bar.dataset.teamBar ?? ''];
      expect(team, bar.dataset.teamBar).toBeDefined();
      expect(bar).toHaveStyle({ backgroundColor: team?.color });
    }
  });

  it('keeps an unmatched team as plain text with an empty bar slot', () => {
    // Every season before 2026 has these. The row must survive the failed join.
    const { container } = render(<ConstructorStandingsTable rows={standings2024.constructors} />);

    expect(bodyRows(container)).toHaveLength(standings2024.constructors.length);
    for (const name of ['Kick Sauber', 'RB']) {
      const bar = rowFor(name).querySelector<HTMLElement>('[data-team-bar]');
      expect(bar?.dataset.teamBar).toBe('unmatched');
      expect(bar?.style.backgroundColor).toBe('');
    }
  });
});

describe('colour on both tables', () => {
  function renderBoth() {
    return render(
      <>
        <DriverStandingsTable rows={standings2026.drivers} />
        <ConstructorStandingsTable rows={standings2026.constructors} />
      </>,
    );
  }

  it('puts no team colour on any text', () => {
    // A livery on text needs a backdrop variant from lib/team-utils.ts first. This is where
    // adding one without that gets caught.
    const { container } = renderBoth();

    expect(inlineColouredText(container)).toEqual([]);
  });

  it('keeps every neutral readable on the bare page it really sits on', () => {
    // Exact, not a lower bound: the next test pins that no row has a fill, so zinc-950 really is
    // behind every glyph.
    const { container } = renderBoth();
    const runs = restingTextNeutrals(container);

    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(contrastRatio(run.hex, DARK_BG), run.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('has no fill on any table element', () => {
    const { container } = renderBoth();

    for (const el of Array.from(container.querySelectorAll('table, thead, tbody, tr, th, td'))) {
      const fills = Array.from(el.classList).filter((c) => /^([a-z-]+:)*bg-/.test(c));
      expect(fills, el.tagName).toEqual([]);
    }
  });
});
