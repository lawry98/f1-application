import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DriverPortrait } from '@/components/teams/driver-portrait';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { TEAMS, TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const leclerc = ferrari.drivers[0];
const hamilton = ferrari.drivers[1];

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('DriverPortrait', () => {
  it('renders the headshot with the driver name as alt text', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByAltText('Charles Leclerc')).toBeInTheDocument();
  });

  it('always shows name, number and nationality regardless of image state', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Monégasque')).toBeInTheDocument();
  });

  it('drops the image and keeps the plate when the headshot fails to load', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('marks the first team’s portraits as priority to avoid a blank rail on arrival', () => {
    const { container } = render(
      <DriverPortrait driver={leclerc} team={ferrari} priority />,
    );
    expect(container.querySelector('img')).toHaveAttribute('fetchpriority', 'high');
  });

  it('re-attempts the image when the driver prop changes on the same instance, even after a prior failure', () => {
    const { rerender } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();

    rerender(<DriverPortrait driver={hamilton} team={ferrari} />);

    expect(screen.getByAltText('Lewis Hamilton')).toBeInTheDocument();
  });

  // The nationality line is 10px, so the team colour it is painted in has to clear AA against
  // the page. Seven of the eleven liveries do not raw; Racing Bulls' #2b4562 sat at 2.02:1
  // and was effectively invisible. Rendered rather than unit-tested on team-utils alone, so
  // the component cannot quietly go back to `team.color`.
  it('paints the nationality line in a colour that clears AA for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const driver = team.drivers[0]!;
      const { unmount } = render(<DriverPortrait driver={driver} team={team} />);
      const colour = screen.getByText(driver.nationality).style.color;
      expect(colour, `${team.shortName} nationality colour`).not.toBe('');
      expect(
        contrastRatio(rgbToHex(colour), DARK_BG),
        `${team.shortName} nationality ${colour}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  it('keeps the fallback latched when the same failed driver is re-rendered', () => {
    const { rerender } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();

    rerender(<DriverPortrait driver={leclerc} team={ferrari} />);

    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
  });
});
