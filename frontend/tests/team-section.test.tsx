import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TeamSection } from '@/components/teams/team-section';
import { monogram } from '@/components/teams/team-monogram-tile';
import { TEAM_MAP } from '@/data/teams-data';
import { seamWash, seamLabelColor, readableOnDark, SEAM_WASH_ALPHA } from '@/lib/team-utils';

const mclaren = TEAM_MAP['mclaren']!;
// McLaren's #ff8700 already clears AA everywhere, so it cannot show the seam fix. Ferrari
// is one of the seven that failed on the wash.
const ferrari = TEAM_MAP['ferrari']!;

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

  // The contrast maths lives in team-utils and is asserted over all eleven teams there.
  // What that cannot see is the component quietly authoring its own gradient or its own
  // label colour again — which is exactly how the seam failed AA in the first place. These
  // two pin the rendered DOM to the helpers, so the wash alpha and the label can only be
  // retuned together.
  // jsdom normalises the `#rrggbbaa` stop the component writes into `rgba(r, g, b, a)`, so
  // this compares the channels rather than the serialised text — which also keeps it from
  // breaking on a jsdom that serialises differently.
  it('paints the wash from the shared helper, at the authored alpha', () => {
    const { container } = render(
      <TeamSection team={ferrari} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const seam = container.querySelector<HTMLElement>('[data-testid="team-seam"]')!;

    const rendered = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/.exec(
      seam.getAttribute('style') ?? '',
    );
    expect(rendered, 'seam wash is not a translucent colour stop').not.toBeNull();

    const wash = seamWash(ferrari.color);
    const expected = [1, 3, 5].map((i) => parseInt(wash.slice(i, i + 2), 16));
    expect([1, 2, 3].map((i) => Number(rendered![i]))).toEqual(expected);
    expect(Number(rendered![4])).toBeCloseTo(SEAM_WASH_ALPHA, 2);
  });

  it('colours the seam label against the wash, not against the page background', () => {
    render(
      <TeamSection team={ferrari} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const label = screen.getByTestId('team-seam-label');
    expect(label).toHaveStyle({ color: seamLabelColor(ferrari.color) });
    // The bug: this is the colour it used to get, and it fails AA on the wash.
    expect(seamLabelColor(ferrari.color)).not.toBe(readableOnDark(ferrari.color));
  });
});
