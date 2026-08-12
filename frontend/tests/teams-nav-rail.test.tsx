import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { monogram } from '@/components/teams/team-monogram-tile';
import {
  contrastRatio,
  DARK_BG,
  MIN_CONTRAST,
  MIN_RING_CONTRAST,
  RAIL_ACTIVE_ALPHA,
  RAIL_ACTIVE_FILL,
  railStandingBackdrop,
  railStandingColor,
} from '@/lib/team-utils';
import { TEAMS } from '@/data/teams-data';
import { restingTextNeutrals } from './zinc';

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}


function renderRail({
  activeTeamId = 'ferrari',
  onSelectTeam = vi.fn(),
  reducedMotion = false,
}: {
  activeTeamId?: string;
  onSelectTeam?: (id: string) => void;
  reducedMotion?: boolean;
} = {}) {
  return render(
    <TeamsNavRail
      activeTeamId={activeTeamId}
      onSelectTeam={onSelectTeam}
      reducedMotion={reducedMotion}
    />,
  );
}

/** The progress track's fill — the element whose transform the active index drives. */
function progressFill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.origin-top');
  if (!el) throw new Error('progress fill not found');
  return el as HTMLElement;
}

describe('TeamsNavRail', () => {
  it('shows position and points for each team', () => {
    renderRail();
    expect(screen.getByText('P1 · 379 PTS')).toBeInTheDocument();
    expect(screen.getByText('P2 · 307 PTS')).toBeInTheDocument();
  });

  // Brief item 2. The rail used to render a document-order 01–11 alongside P#, and because
  // TEAMS order is 1,2,3,4,7,5,8,6,9,11,10 the two disagreed from the fifth row down —
  // Haas showed "05" next to "P7 · 21 PTS". The sequence numeral is gone; what remains is
  // labelled.
  it('shows no bare document-order numeral beside the standing', () => {
    const { container } = renderRail();
    const haasStanding = screen.getByText('P7 · 21 PTS');
    const row = haasStanding.closest('a');
    expect(row).not.toBeNull();
    expect(row!.textContent).not.toMatch(/\b0[1-9]\b|\b1[01]\b/);
    // And nowhere else in the rail either.
    expect(container.textContent).not.toMatch(/\b0[1-9]\b/);
  });

  it('names what the standings line is, so the numbers are not unexplained', () => {
    renderRail();
    expect(screen.getByText(/championship/i)).toBeInTheDocument();
  });

  // Brief items 4 and 14: real links to real fragments, so middle-click and
  // open-in-new-tab work, and no scroll arithmetic is needed.
  it('renders every team as an anchor to its section', () => {
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      expect(link).toHaveAttribute('href', `#team-${team.id}`);
    }
  });

  it('claims the clicked team without preventing the browser’s own navigation', () => {
    const onSelectTeam = vi.fn();
    renderRail({ onSelectTeam });
    const link = screen.getByRole('link', { name: /mclaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    // The anchor must be left to do its own job — that is what pushes the history entry.
    expect(event.defaultPrevented).toBe(false);
  });

  // aria-current="true" is valid but says nothing about *why*. "location" is the token for
  // "this is the current place in a set of navigation links".
  it('marks the active team with aria-current="location"', () => {
    renderRail();
    const current = screen.getAllByRole('link', { current: 'location' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
    expect(current[0]).toHaveAttribute('aria-current', 'location');
  });

  it('renders a uniform monogram tile for every team, including racing-bulls', () => {
    renderRail();
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(screen.getByText(monogram(team.shortName))).toBeInTheDocument();
    }
  });

  // Brief item 13 names focus indicators specifically. Tailwind's ring is a box-shadow that
  // reads --tw-ring-color, so a team-derived ring has to set that property — an outlineColor
  // would silently do nothing and leave the ring at Tailwind's default translucent blue.
  it('gives every row a team-derived focus ring that clears non-text contrast', () => {
    expect(TEAMS).toHaveLength(11);
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      const ring = link.style.getPropertyValue('--tw-ring-color');
      expect(ring, `${team.shortName} has no --tw-ring-color`).not.toBe('');
      expect(
        contrastRatio(ring, DARK_BG),
        `${team.shortName} ring ${ring}`,
      ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
    }
  });

  // This assertion used to read `contrastRatio(..., DARK_BG)` and passed for all eleven teams
  // while the rendered page failed — the active row is the one place in the rail that is *not*
  // on the page background. It sits on the `bg-zinc-800/60` highlight, and a browser measured
  // Ferrari's line at 4.02:1 there against the 4.66:1 this test certified. The background is
  // the only thing that was wrong with it.
  it('keeps the active row’s standings line above AA against its own highlight', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = renderRail({ activeTeamId: team.id });
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), railStandingBackdrop()),
        `${team.shortName} standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  it('colours the active row’s standings line for the highlight, not for the page', () => {
    const { unmount } = renderRail({ activeTeamId: 'ferrari' });
    const line = screen.getByText('P2 · 307 PTS');
    expect(rgbToHex(line.style.color)).toBe(railStandingColor('#dc0000'));
    unmount();
  });

  // The maths above is only right while the highlight really is zinc-800 at 60%. Tailwind class
  // names cannot be built from a runtime constant — the JIT scans source text — so the component
  // keeps the literal and this pins the two together, the same way the seam's wash is pinned.
  it('paints the highlight at the opacity the contrast maths assumes', () => {
    const { container } = renderRail({ activeTeamId: 'ferrari' });
    const highlight = container.querySelector('.bg-zinc-800\\/60');
    expect(highlight, 'active highlight is no longer bg-zinc-800/60').not.toBeNull();
    expect(RAIL_ACTIVE_FILL).toBe('#27272a'); // Tailwind zinc-800
    expect(RAIL_ACTIVE_ALPHA).toBe(0.6);
  });

  // The rail's own neutrals. Both header lines and every inactive row label are judged here,
  // so the 2.57:1 subheader this branch introduced and the inherited 4.12:1 rows are one test.
  it('holds every resting neutral in the rail above AA on the page background', () => {
    const { container } = renderRail();
    const neutrals = restingTextNeutrals(container);
    // Guards the guard: if the classes move to inline styles this test would silently pass.
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('holds the inactive rows’ standings lines above AA', () => {
    renderRail({ activeTeamId: 'ferrari' });
    for (const team of TEAMS) {
      if (team.id === 'ferrari') continue;
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), DARK_BG),
        `${team.shortName} inactive standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('sets the progress track to a sliver on the first team and full on the last', () => {
    const first = TEAMS.at(0);
    const last = TEAMS.at(-1);
    if (!first || !last) throw new Error('TEAMS must not be empty');

    const { container: firstContainer } = renderRail({ activeTeamId: first.id });
    expect(progressFill(firstContainer).style.transform).toBe(`scaleY(${1 / TEAMS.length})`);

    const { container: lastContainer } = renderRail({ activeTeamId: last.id });
    expect(progressFill(lastContainer).style.transform).toBe('scaleY(1)');
  });

  it('animates the progress track only when motion is allowed', () => {
    const { container } = renderRail();
    expect(progressFill(container).className).toMatch(/transition-transform/);
  });

  it('drops the progress track transition under reduced motion', () => {
    const { container } = renderRail({ reducedMotion: true });
    const fill = progressFill(container);
    expect(fill.className).not.toMatch(/transition-transform/);
    expect(fill.style.transform).toBe(`scaleY(${2 / TEAMS.length})`);
  });
});
