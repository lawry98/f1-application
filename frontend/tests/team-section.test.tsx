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

  // Brief item 5. Eleven per-section observers firing on isIntersecting fought at every
  // boundary. The page has exactly one spy now, and it lives in hooks/use-scroll-spy.ts.
  //
  // vi.spyOn(globalThis, 'IntersectionObserver') looks like the natural way to assert
  // this, but tinyspy's wrapper does not forward `new` correctly for this constructor:
  // the instance it hands back is missing the real prototype (no .observe), which
  // breaks BlurFade's own legitimate useInView call and fails every test in this file,
  // not just this one. Subclassing the real observer keeps `new` working (constructor
  // chains through `super`) while still letting us record what it was constructed with.
  it('constructs no IntersectionObserver of its own', () => {
    const RealObserver = globalThis.IntersectionObserver;
    const calls: ConstructorParameters<typeof IntersectionObserver>[] = [];
    class TrackingObserver extends RealObserver {
      constructor(...args: ConstructorParameters<typeof IntersectionObserver>) {
        super(...args);
        calls.push(args);
      }
    }
    globalThis.IntersectionObserver = TrackingObserver as unknown as typeof IntersectionObserver;

    try {
      renderSection();
    } finally {
      globalThis.IntersectionObserver = RealObserver;
    }

    // BlurFade's useInView legitimately builds its own; what must not appear is one
    // observing this section for activation purposes.
    const activationObservers = calls.filter(
      ([, options]) => options?.rootMargin?.includes('-15%') ?? false,
    );
    expect(activationObservers).toHaveLength(0);
  });

  // Brief item 4: the browser does the scrolling, against this offset. No handler maths.
  it('carries a scroll offset so an anchored jump clears the fixed nav', () => {
    renderSection();
    const section = document.getElementById('team-mclaren');
    expect(section?.className).toMatch(/scroll-mt-\[var\(--teams-scroll-offset\)\]/);
  });

  // Brief item 10's consequence: the dossier is gone below xl, so the standing has to be
  // in the section or it disappears from the page below 1280px.
  it('states the team’s championship standing', () => {
    renderSection();
    expect(screen.getByTestId('section-standing')).toHaveTextContent('P3');
    expect(screen.getByTestId('section-standing')).toHaveTextContent('220 PTS');
  });

  // Brief item 3's trap. The dossier moves to xl, so the button that reaches the 3D
  // inspector has to survive down to xl — not lg — or 1024-1279px gets neither.
  it('exposes the inspect action below xl, not below lg', () => {
    renderSection();
    const button = screen.getByRole('button', { name: /inspect/i });
    const wrapper = button.closest('[class*="hidden"]') ?? button.parentElement;
    expect(wrapper?.className).toMatch(/xl:hidden/);
    expect(wrapper?.className).not.toMatch(/(^|\s)lg:hidden/);
  });

  // Brief item 9: the separator used to be a 1px rule in this section's own colour at its
  // top edge, sitting directly under the previous team's content, where it read as that
  // team's bottom border.
  it('opens with a seam that names the team it introduces', () => {
    renderSection();
    const seam = screen.getByTestId('team-seam');
    expect(seam).toHaveTextContent(mclaren.name);
  });
});
