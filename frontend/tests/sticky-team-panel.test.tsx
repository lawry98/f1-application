import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;

describe('StickyTeamPanel', () => {
  it('shows the logo, both drivers and the meta grid', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('Lewis Hamilton')).toBeInTheDocument();
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    expect(screen.getByText('Ferrari')).toBeInTheDocument();
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
