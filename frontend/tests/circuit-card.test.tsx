import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircuitCard } from '@/components/circuits/circuit-card';
import type { SeasonCircuit } from '@/hooks/use-season-circuits';
import { toPoints } from '@/lib/circuit-geometry';
import monza from '@/data/circuits/it-1922.json';
import type { Race } from '@/types';

function race(overrides: Partial<Race> = {}): Race {
  return {
    name: 'Italian Grand Prix',
    location: 'Monza',
    country: 'Italy',
    date: '2026-09-06 00:00:00',
    round: 13,
    event_format: 'conventional',
    official_name: 'FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026',
    ...overrides,
  };
}

const withOutline: SeasonCircuit = {
  race: race(),
  geometry: { ...monza, points: toPoints(monza.points) },
  slug: 'monza',
};

describe('CircuitCard', () => {
  it('links a drawn circuit to its detail page, carrying the season', () => {
    render(<CircuitCard circuit={withOutline} year={2025} />);

    const link = screen.getByRole('link', { name: /Italian Grand Prix/ });
    expect(link).toHaveAttribute('href', '/circuits/monza?year=2025');
    expect(screen.getByText('Round 13')).toBeInTheDocument();
    expect(screen.getByText('06 SEP')).toBeInTheDocument();
    expect(screen.getByText('Monza, Italy')).toBeInTheDocument();
  });

  /*
   * In a grid the card *is* the content, so a missing outline must not delete the race from the
   * calendar the way the briefing band hides its decoration. The slot keeps its box; nothing is
   * drawn in it; and there is no detail page to link to.
   */
  it('keeps a race with no outline, captioned, and not a link', () => {
    render(
      <CircuitCard
        circuit={{ race: race({ location: 'Brands Hatch', country: 'UK' }), geometry: null, slug: null }}
        year={1985}
      />,
    );

    expect(screen.getByText('Italian Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('No track map')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[data-circuit-slot]')).not.toBeNull();
  });

  it('marks a sprint weekend', () => {
    render(
      <CircuitCard circuit={{ ...withOutline, race: race({ event_format: 'sprint_qualifying' }) }} year={2026} />,
    );

    expect(screen.getByText('Sprint')).toBeInTheDocument();
  });

  it('marks nothing on a conventional weekend', () => {
    render(<CircuitCard circuit={withOutline} year={2026} />);

    expect(screen.queryByText('Sprint')).toBeNull();
  });
});
