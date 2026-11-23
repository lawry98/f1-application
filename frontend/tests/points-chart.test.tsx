import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PointsChart } from '@/components/standings/points-chart';
import type { ChartRow } from '@/lib/points-chart';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import standings2026 from './fixtures/standings-2026.json';
import { inlineColouredText, restingTextNeutrals } from './zinc';

const ROUNDS = standings2026.rounds;
const DRIVERS: ChartRow[] = standings2026.drivers.map((row) => ({
  key: row.driver_code,
  label: row.driver_code,
  team: row.team,
  points_by_round: row.points_by_round,
}));

function renderDrivers(rows: ChartRow[] = DRIVERS, rounds = ROUNDS) {
  return render(<PointsChart title="Drivers' points by round" rows={rows} rounds={rounds} />);
}

describe('PointsChart', () => {
  it('is one image whose name states what it shows and who leads', () => {
    renderDrivers();

    const chart = screen.getByRole('img', { name: /Drivers' points by round/ });
    expect(chart).toHaveAccessibleName(expect.stringContaining('after each of 14 rounds'));
    expect(chart).toHaveAccessibleName(expect.stringContaining('ANT leads on 292'));
  });

  it('draws one line per row', () => {
    const { container } = renderDrivers();

    expect(container.querySelectorAll('path[data-series]')).toHaveLength(DRIVERS.length);
  });

  it('labels only the five leaders, at the end of their lines', () => {
    const { container } = renderDrivers();

    const labels = Array.from(container.querySelectorAll('text[data-label]')).map(
      (el) => el.textContent,
    );
    expect(labels.sort()).toEqual(['ANT', 'HAM', 'LEC', 'NOR', 'RUS']);
  });

  it("dashes the second car of a team, whose line shares its teammate's colour", () => {
    const { container } = renderDrivers();

    const dashed = Array.from(container.querySelectorAll('path[stroke-dasharray]')).map((el) =>
      el.getAttribute('data-series'),
    );
    expect(dashed.sort()).toEqual(['LEC', 'RUS']);
  });

  it('draws the leader last, on top of every other line', () => {
    const { container } = renderDrivers();

    const paths = container.querySelectorAll('path[data-series]');
    expect(paths[paths.length - 1]?.getAttribute('data-series')).toBe('ANT');
  });

  it('draws nothing for a season with fewer than two rounds, which has no line to show', () => {
    const { container } = renderDrivers(
      DRIVERS.map((row) => ({ ...row, points_by_round: row.points_by_round.slice(0, 1) })),
      ROUNDS.slice(0, 1),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('paints every glyph readable as small text on the bare page', () => {
    const { container } = renderDrivers();

    const coloured = inlineColouredText(container);
    expect(coloured.map((run) => run.text).sort()).toEqual(['ANT', 'HAM', 'LEC', 'NOR', 'RUS']);
    for (const run of [...coloured, ...restingTextNeutrals(container)]) {
      expect(contrastRatio(run.hex, DARK_BG), run.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('says in a visible caption which lines are coloured', () => {
    renderDrivers();

    expect(screen.getByText(/top five in colour/i)).toBeInTheDocument();
  });
});
