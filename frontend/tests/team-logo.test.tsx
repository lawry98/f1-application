import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamLogo } from '@/components/teams/team-logo';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const haas = TEAM_MAP['haas']!;

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
});
