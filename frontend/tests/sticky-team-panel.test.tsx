import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;

describe('StickyTeamPanel', () => {
  it('shows the logo, both drivers and the meta grid', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped to the logo's own accessible name — a bare getByText('Ferrari') is satisfied
    // by the Power-unit MetaCell (Ferrari supplies its own engine) and never touches the
    // logo at all.
    expect(screen.getByRole('img', { name: /ferrari logo/i })).toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('Lewis Hamilton')).toBeInTheDocument();
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    // Label and value asserted together so this can't be satisfied by the logo alt text
    // or a stray team-name element — only the Power-unit cell has both.
    expect(screen.getByText('Power unit').nextElementSibling).toHaveTextContent('Ferrari');
  });

  it('carries the debut year and derives seasons from it', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
  });

  it('shows the championship count', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped by testid, not getByText('16'): Ferrari has 16 championships AND
    // Leclerc is car 16, so a bare text query matches twice and throws.
    expect(screen.getByTestId('championship-count')).toHaveTextContent('16');
  });

  it('calls onInspect when the CTA is pressed', () => {
    const onInspect = vi.fn();
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it('renders a team with no championships without claiming a bar', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
