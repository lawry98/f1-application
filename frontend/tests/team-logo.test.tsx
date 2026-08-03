import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamLogo } from '@/components/teams/team-logo';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const haas = TEAM_MAP['haas']!;
const mclaren = TEAM_MAP['mclaren']!;

describe('TeamLogo', () => {
  it('renders the logo image from the team path', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    const img = screen.getByAltText('Ferrari logo');
    expect(img).toBeInTheDocument();
  });

  it('falls back to a monogram when the image fails to load', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.queryByAltText('Ferrari logo')).not.toBeInTheDocument();
    expect(screen.getByText('FER')).toBeInTheDocument();
  });

  it('gives the monogram the team colour', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ backgroundColor: '#dc0000' });
  });

  it('skips spaces when building a monogram from a multi-word name', () => {
    const astonMartin = TEAM_MAP['aston-martin']!;
    render(<TeamLogo team={astonMartin} size={48} />);
    fireEvent.error(screen.getByAltText('Aston Martin logo'));
    expect(screen.getByText('AST')).toBeInTheDocument();
  });

  it('keeps the white livery legible by darkening the monogram text', () => {
    render(<TeamLogo team={haas} size={48} />);
    fireEvent.error(screen.getByAltText('Haas logo'));
    expect(screen.getByText('HAA')).toHaveStyle({ color: '#000000' });
  });

  it('re-attempts the image when the team prop changes on the same instance, even after a prior failure', () => {
    const { rerender } = render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toBeInTheDocument();

    rerender(<TeamLogo team={mclaren} size={48} />);

    expect(screen.getByAltText('McLaren logo')).toBeInTheDocument();
    expect(screen.queryByText('FER')).not.toBeInTheDocument();
    expect(screen.queryByText('MCL')).not.toBeInTheDocument();
  });

  // Real team marks are horizontal lockups (0.91:1 up to 9.48:1). A square box makes
  // object-contain scale them to fit the width, so a wide logo draws a few px tall and the
  // monogram it replaced was more legible. These pin height-driven sizing so a refactor
  // cannot quietly restore `width: size, height: size`.
  it('sizes by height and lets the width follow the logo’s natural aspect ratio', () => {
    render(<TeamLogo team={mclaren} size={48} />);
    const img = screen.getByAltText('McLaren logo');
    expect(img).toHaveStyle({ height: '48px' });
    expect(img).toHaveStyle({ width: 'auto' });
  });

  it('caps the width so an extreme wordmark cannot blow the container open', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    expect(screen.getByAltText('Ferrari logo')).toHaveStyle({ maxWidth: '192px' });
  });

  it('lets a narrow container override the width cap', () => {
    render(<TeamLogo team={ferrari} size={48} maxWidth={120} />);
    expect(screen.getByAltText('Ferrari logo')).toHaveStyle({ maxWidth: '120px' });
  });

  it('keeps the monogram fallback square — it is a tile, not a wordmark', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('keeps the fallback latched when the same failed team is re-rendered', () => {
    const { rerender } = render(<TeamLogo team={ferrari} size={48} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toBeInTheDocument();

    rerender(<TeamLogo team={ferrari} size={48} />);

    expect(screen.getByText('FER')).toBeInTheDocument();
    expect(screen.queryByAltText('Ferrari logo')).not.toBeInTheDocument();
  });
});
