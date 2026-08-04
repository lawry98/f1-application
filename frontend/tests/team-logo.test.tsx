import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamLogo } from '@/components/teams/team-logo';
import { readableOnDark } from '@/lib/team-utils';
import { TEAM_MAP } from '@/data/teams-data';

const ferrari = TEAM_MAP['ferrari']!;
const haas = TEAM_MAP['haas']!;
const mclaren = TEAM_MAP['mclaren']!;
const racingBulls = TEAM_MAP['racing-bulls']!;

describe('TeamLogo', () => {
  it('renders the logo image from the team path', () => {
    render(<TeamLogo team={ferrari} size={48} />);
    const img = screen.getByAltText('Ferrari logo');
    expect(img).toBeInTheDocument();
  });

  // `size` here is 24, not the 48 used by the image-branch tests above: it must stay below
  // `TeamLogo`'s wordmark-fallback threshold (30) so this keeps exercising the monogram tile.
  it('falls back to a monogram when the image fails to load', () => {
    render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.queryByAltText('Ferrari logo')).not.toBeInTheDocument();
    expect(screen.getByText('FER')).toBeInTheDocument();
  });

  it('gives the monogram the team colour', () => {
    render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ backgroundColor: '#dc0000' });
  });

  it('skips spaces when building a monogram from a multi-word name', () => {
    const astonMartin = TEAM_MAP['aston-martin']!;
    render(<TeamLogo team={astonMartin} size={24} />);
    fireEvent.error(screen.getByAltText('Aston Martin logo'));
    expect(screen.getByText('AST')).toBeInTheDocument();
  });

  it('keeps the white livery legible by darkening the monogram text', () => {
    render(<TeamLogo team={haas} size={24} />);
    fireEvent.error(screen.getByAltText('Haas logo'));
    expect(screen.getByText('HAA')).toHaveStyle({ color: '#000000' });
  });

  it('re-attempts the image when the team prop changes on the same instance, even after a prior failure', () => {
    const { rerender } = render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toBeInTheDocument();

    rerender(<TeamLogo team={mclaren} size={24} />);

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
    render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ width: '24px', height: '24px' });
  });

  // The fallback used to be a bare <div> with text: no role, no accessible name. The image
  // branch has always had `alt="<shortName> logo"`, so a team whose logo 404s vanished from
  // the accessibility tree as a logo and announced only its raw glyphs — `racing-bulls` has
  // no logo file at all, and the sticky panel renders the team name nowhere else, so its
  // dossier identified the constructor by the string "RAC" or not at all.
  it('gives the monogram fallback the same accessible name as the image branch', () => {
    render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));

    const fallback = screen.getByRole('img', { name: 'Ferrari logo' });
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent('FER');
  });

  // One monogram tile, not two implementations. The fallback previously scaled its glyph with
  // `size * 0.3` while TeamMonogramTile hardcoded `text-[8px]`, so the shared primitive's
  // `size` prop was a lie above ~26px: pass 24 and you got 8px text in a 24px box. Both values
  // stay below the wordmark-fallback threshold (30) so this keeps exercising the monogram tile.
  it('scales the fallback glyph with size, matching TeamMonogramTile', () => {
    const { unmount } = render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ fontSize: '9px' });
    unmount();

    render(<TeamLogo team={ferrari} size={22} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toHaveStyle({ fontSize: '8px' });
  });

  // `relative z-10` used to be baked into TeamMonogramTile for the nav rail's benefit alone.
  // A shared primitive that positions itself cannot be composed anywhere else.
  it('does not impose positioning or stacking on the fallback', () => {
    render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    const fallback = screen.getByText('FER');
    expect(fallback.className).not.toMatch(/\brelative\b/);
    expect(fallback.className).not.toMatch(/\bz-10\b/);
  });

  it('keeps the fallback latched when the same failed team is re-rendered', () => {
    const { rerender } = render(<TeamLogo team={ferrari} size={24} />);
    fireEvent.error(screen.getByAltText('Ferrari logo'));
    expect(screen.getByText('FER')).toBeInTheDocument();

    rerender(<TeamLogo team={ferrari} size={24} />);

    expect(screen.getByText('FER')).toBeInTheDocument();
    expect(screen.queryByAltText('Ferrari logo')).not.toBeInTheDocument();
  });

  // Racing Bulls has no logo file at all (see CREDITS.md) — its `TeamLogo` always renders the
  // fallback branch. At the sizes where the real callers use it (56 in the sticky panel, 30 in
  // the hero's hover reveal), a three-letter monogram square reads as a broken image beside
  // real wordmarks, so above the threshold it should render its name as styled type instead.
  describe('the wordmark fallback (size >= 30)', () => {
    it('renders the team name instead of a monogram at size 56', () => {
      render(<TeamLogo team={racingBulls} size={56} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));

      expect(screen.getByText('Racing Bulls')).toBeInTheDocument();
      expect(screen.queryByText('RAC')).not.toBeInTheDocument();
    });

    it('renders the team name instead of a monogram at size 30, the smallest real call site', () => {
      render(<TeamLogo team={racingBulls} size={30} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));

      expect(screen.getByText('Racing Bulls')).toBeInTheDocument();
      expect(screen.queryByText('RAC')).not.toBeInTheDocument();
    });

    it('keeps the same accessible name as the image and monogram branches', () => {
      render(<TeamLogo team={racingBulls} size={56} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));

      const fallback = screen.getByRole('img', { name: 'Racing Bulls logo' });
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent('Racing Bulls');
    });

    it('colours the text so it clears contrast on zinc-950, not the raw livery colour', () => {
      // Racing Bulls' `#2b4562` sits at ~2.02:1 against zinc-950 — below the 4.5:1 floor —
      // so the wordmark must use `readableOnDark`'s lightened colour, not the true livery hex.
      render(<TeamLogo team={racingBulls} size={56} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));

      const fallback = screen.getByText('Racing Bulls');
      expect(fallback).toHaveStyle({ color: readableOnDark(racingBulls.color) });
      expect(readableOnDark(racingBulls.color)).not.toBe(racingBulls.color);
    });

    it('scales the wordmark size with the `size` prop', () => {
      const { unmount } = render(<TeamLogo team={racingBulls} size={56} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));
      expect(screen.getByText('Racing Bulls')).toHaveStyle({ fontSize: '24px', height: '56px' });
      unmount();

      render(<TeamLogo team={racingBulls} size={30} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));
      expect(screen.getByText('Racing Bulls')).toHaveStyle({ fontSize: '13px', height: '30px' });
    });

    it('respects the same maxWidth prop as the image branch', () => {
      render(<TeamLogo team={racingBulls} size={56} maxWidth={120} />);
      fireEvent.error(screen.getByAltText('Racing Bulls logo'));
      expect(screen.getByText('Racing Bulls')).toHaveStyle({ maxWidth: '120px' });
    });
  });

  // Below the threshold, nothing changes: the fallback is still exactly `TeamMonogramTile`.
  // The 22px nav rail and comparison grid call `TeamMonogramTile` directly and never reach
  // `TeamLogo`, but any future caller passing a small `size` here must still get the tile.
  it('keeps the monogram fallback below the wordmark threshold (size < 30)', () => {
    render(<TeamLogo team={racingBulls} size={22} />);
    fireEvent.error(screen.getByAltText('Racing Bulls logo'));

    expect(screen.getByText('RAC')).toBeInTheDocument();
    expect(screen.getByText('RAC')).toHaveStyle({ width: '22px', height: '22px' });
    expect(screen.queryByText('Racing Bulls')).not.toBeInTheDocument();
  });
});
