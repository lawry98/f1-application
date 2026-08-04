import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamSection } from '@/components/teams/team-section';
import { monogram } from '@/components/teams/team-monogram-tile';
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

  // The glow blob only ever animates `opacity`. Hinting `transform` promoted eleven
  // 40vw×40vw compositor layers for the whole life of the page and bought nothing.
  it('hints will-change for the only property the glow blob animates', () => {
    const { container } = renderSection();
    const blob = container.querySelector('.pointer-events-none.absolute[style*="blur"]');
    expect(blob).not.toBeNull();
    expect(blob!.className).toMatch(/will-change-\[opacity\]/);
    expect(blob!.className).not.toMatch(/will-change-transform/);
  });

  it('draws the watermark from the shared monogram helper', () => {
    const { container } = renderSection();
    expect(container.querySelector('[data-testid="team-watermark"]')).toHaveTextContent(
      monogram(mclaren.shortName),
    );
  });
});
