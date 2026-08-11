import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamsChipStrip } from '@/components/teams/teams-chip-strip';
import { TEAMS } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function renderStrip({
  activeTeamId = 'ferrari',
  onSelectTeam = vi.fn(),
  reducedMotion = false,
} = {}) {
  return render(
    <TeamsChipStrip
      activeTeamId={activeTeamId}
      onSelectTeam={onSelectTeam}
      reducedMotion={reducedMotion}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TeamsChipStrip', () => {
  // The component owns its landmark now — `teams-page-client.tsx` no longer wraps it in a
  // `<nav>` of its own, so this is the one place proving the accessible name still exists.
  it('renders as its own labelled navigation landmark', () => {
    renderStrip();
    expect(
      screen.getByRole('navigation', { name: 'Constructor navigation, compact' }),
    ).toBeInTheDocument();
  });

  it('renders one anchor per team', () => {
    renderStrip();
    expect(screen.getAllByRole('link')).toHaveLength(TEAMS.length);
    for (const team of TEAMS) {
      expect(screen.getByRole('link', { name: new RegExp(team.shortName, 'i') })).toHaveAttribute(
        'href',
        `#team-${team.id}`,
      );
    }
  });

  it('keeps position but drops points — there is no room in a chip', () => {
    renderStrip();
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.queryByText('P1 · 379 PTS')).not.toBeInTheDocument();
  });

  it('marks the active chip with aria-current="location"', () => {
    renderStrip();
    const current = screen.getAllByRole('link', { current: 'location' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
  });

  // Brief item 6. Eleven chips overflow every phone, so the active one is routinely off
  // screen — the strip showed no sign of which team you were on.
  it('centres the active chip when it changes', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = renderStrip({ activeTeamId: 'ferrari' });
    scrollIntoView.mockClear();

    rerender(
      <TeamsChipStrip activeTeamId="cadillac" onSelectTeam={vi.fn()} reducedMotion={false} />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
    );
  });

  // Reduced motion must stop the travel, not shorten it: this is a horizontal pan that
  // fires on every section crossing.
  it('jumps rather than pans under reduced motion', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = renderStrip({ activeTeamId: 'ferrari', reducedMotion: true });
    scrollIntoView.mockClear();

    rerender(
      <TeamsChipStrip activeTeamId="cadillac" onSelectTeam={vi.fn()} reducedMotion />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
  });

  it('shows overflow fades that screen readers ignore', () => {
    const { container } = renderStrip();
    const fades = container.querySelectorAll('[data-testid="chip-fade"]');
    expect(fades).toHaveLength(2);
    for (const fade of Array.from(fades)) {
      expect(fade).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('claims the clicked team without preventing navigation', () => {
    const onSelectTeam = vi.fn();
    renderStrip({ onSelectTeam });
    const link = screen.getByRole('link', { name: /mclaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    expect(event.defaultPrevented).toBe(false);
  });

  // The strip is the below-`lg` navigation, so a 1440px sweep never sees it — and it carried the
  // same `zinc-500` inactive label as the rail did, at 4.12:1.
  it('holds every resting neutral chip above AA on the page background', () => {
    const { container } = renderStrip();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
