import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamSection } from '@/components/teams/team-section';
import { TEAM_MAP } from '@/data/teams-data';

const mclaren = TEAM_MAP['mclaren']!;

function renderSection(overrides: Partial<Parameters<typeof TeamSection>[0]> = {}) {
  return render(
    <TeamSection
      team={mclaren}
      index={2}
      isActive
      onActivate={vi.fn()}
      onInspect={vi.fn()}
      reducedMotion={false}
      {...overrides}
    />,
  );
}

describe('TeamSection', () => {
  it('renders both drivers as portraits', () => {
    renderSection();
    expect(screen.getByAltText('Lando Norris')).toBeInTheDocument();
    expect(screen.getByAltText('Oscar Piastri')).toBeInTheDocument();
  });

  it('keeps the constructor name and meta stats', () => {
    renderSection();
    expect(screen.getByText('Woking, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('1966')).toBeInTheDocument();
  });

  it('renders a decorative watermark that screen readers ignore', () => {
    const { container } = renderSection();
    const watermark = container.querySelector('[data-testid="team-watermark"]');
    expect(watermark).toHaveAttribute('aria-hidden', 'true');
  });

  it('reports itself active once the stubbed observer fires', () => {
    const onActivate = vi.fn();
    renderSection({ onActivate });
    // tests/setup.ts's IntersectionObserver stub reports everything as immediately
    // in view, so observe() invokes the callback synchronously on mount.
    expect(onActivate).toHaveBeenCalledWith('mclaren');
  });

  it('exposes a scroll target id for the nav rail and hero to jump to', () => {
    renderSection();
    expect(document.getElementById('team-mclaren')).toBeInTheDocument();
  });
});
