import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP, TEAMS } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;

function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('StickyTeamPanel', () => {
  it('shows the team logo', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped to the logo's own accessible name — a bare getByText('Ferrari') is satisfied
    // by the Power-unit MetaCell (Ferrari supplies its own engine).
    expect(screen.getByRole('img', { name: /ferrari logo/i })).toBeInTheDocument();
  });

  // Brief item 1. DriverPortrait used to render here *and* in team-section.tsx, so at lg
  // and up the same two faces were on screen twice. The centre column owns the drivers.
  it('renders no driver portraits — the centre section owns those', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Lewis Hamilton')).not.toBeInTheDocument();
  });

  // Brief item 10. The dossier carried no championship information at all before this.
  it('shows the championship position and points', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByTestId('standings-position')).toHaveTextContent('P2');
    expect(screen.getByText(/307 PTS/)).toBeInTheDocument();
  });

  it('keeps the standings figure readable for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = render(<StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />);
      const position = screen.getByTestId('standings-position');
      const colour = position.style.color;
      if (colour) {
        expect(
          contrastRatio(rgbToHex(colour), DARK_BG),
          `${team.shortName} standings position`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      unmount();
    }
  });

  // Brief item 2: a spelled-out sequence cannot be mistaken for a standing. It used to
  // read "Constructor 05 / 11" for a team standing P7.
  it('spells out its position in the running order', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText(/team 2 of 11/i)).toBeInTheDocument();
  });

  it('does not render a bare two-digit sequence numeral', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(container.textContent).not.toMatch(/\b02\s*\/\s*11\b/);
  });

  it('keeps the all-time stats', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByTestId('championship-count')).toHaveTextContent('16');
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    expect(screen.getByText('Power unit').nextElementSibling).toHaveTextContent('Ferrari');
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
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
    expect(screen.getByTestId('championship-count')).toHaveTextContent('—');
  });

  it('shows a pointless team’s zero without pretending it is a rank', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByTestId('standings-position')).toHaveTextContent('P11');
    expect(screen.getByText(/0 PTS/)).toBeInTheDocument();
  });

  // The dossier's own labels — "Team N of 11", the standing caption, the meta cells — were all
  // `zinc-500` at 4.12:1. Same class as the rail's inherited rows, same fix.
  it('holds every resting neutral label above AA on the page background', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
