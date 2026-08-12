import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DriverPortrait } from '@/components/teams/driver-portrait';
import {
  contrastRatio,
  MIN_CONTRAST,
  portraitCaptionBackdrop,
  portraitCaptionColor,
  portraitScrim,
  PORTRAIT_SCRIM_FADE_PX,
  PORTRAIT_SCRIM_TEXT_INSET,
} from '@/lib/team-utils';
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

  // This measured the nationality line against the *page* background, which is nowhere near it:
  // the line sits inside the portrait, over a photograph, where it was as low as 1.89:1. The
  // colour it checked was right and the background was wrong — the same way the nav rail's
  // active row and the section standing line both passed while failing on screen.
  it('paints the nationality line to clear AA over the portrait, for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const driver = team.drivers[0]!;
      const { unmount } = render(<DriverPortrait driver={driver} team={team} />);
      const colour = screen.getByText(driver.nationality).style.color;
      expect(colour, `${team.shortName} nationality colour`).not.toBe('');
      expect(rgbToHex(colour), `${team.shortName}`).toBe(portraitCaptionColor(team.color));
      expect(
        contrastRatio(rgbToHex(colour), portraitCaptionBackdrop()),
        `${team.shortName} nationality ${colour}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  // A colour alone cannot fix this line: the name beside it is plain white and the short code is
  // a neutral, and neither goes through the colour layer. What makes all three readable over an
  // arbitrary headshot is the scrim, so the scrim is what gets pinned here — including the inset
  // that keeps the text out of the gradient's fade, where the guarantee does not hold.
  it('lays a scrim behind the caption and keeps the text out of its fade', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    const caption = screen.getByText('Monégasque').parentElement!;
    // jsdom drops the redundant `to bottom` keyword — it is the default direction — so allow for
    // exactly that one normalisation and pin everything else to the helper.
    expect(caption.style.background).toBe(portraitScrim().replace('to bottom, ', ''));
    expect(caption.style.background).toContain(`${PORTRAIT_SCRIM_FADE_PX}px`);
    expect(parseFloat(caption.style.paddingTop)).toBe(PORTRAIT_SCRIM_TEXT_INSET);
    expect(PORTRAIT_SCRIM_TEXT_INSET).toBeGreaterThan(PORTRAIT_SCRIM_FADE_PX);
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
