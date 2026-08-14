/**
 * `/briefing`'s page shell — specifically its header band, which is the one strip on the route
 * that does **not** sit on the topographic backdrop.
 *
 * That distinction is the whole reason this file exists. Every other contrast assertion on this
 * route composites `TopoBackground` at 0.12 over `bg-zinc-950` and judges text against `#212124`,
 * because the texture is behind the content. The header band is a *sibling above* that container:
 * it paints bare `bg-zinc-950` and nothing is layered over it. Reusing the page figure here would
 * measure the right colour against the wrong background — and reusing the *header's* figure
 * anywhere below would do the same in the other direction.
 *
 * The two children are stubbed out. `BriefingChat` has its own suite (and its own fetches), and
 * `LandingNav` needs a router; neither is what this file is about, and mounting them would let
 * their runs into a sweep whose backdrop is only correct for the header band.
 */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BriefingPage from '@/app/briefing/page';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals, ZINC } from './zinc';

vi.mock('@/components/briefing/briefing-chat', () => ({
  BriefingChat: () => <div data-testid="briefing-chat" />,
}));

vi.mock('@/components/landing/landing-nav', () => ({
  LandingNav: () => <nav aria-label="Main navigation" />,
}));

describe('the /briefing header band', () => {
  it('keeps its copy, verbatim', () => {
    // The sentence under the title is the page's only description of what it does. It survives
    // the restyle unchanged; only its shade moved.
    const { getByText } = render(<BriefingPage />);

    expect(
      getByText('Enter any Grand Prix name and receive a comprehensive AI-generated briefing.'),
    ).toBeInTheDocument();
  });

  it('holds every resting neutral above the small-text floor on bare zinc-950', () => {
    const { container } = render(<BriefingPage />);

    const neutrals = restingTextNeutrals(container);
    // Non-vacuity: a helper that finds nothing passes the loop below in silence.
    expect(neutrals.length, 'no resting neutrals found in the header band').toBeGreaterThan(0);

    for (const { hex, text } of neutrals) {
      expect(
        contrastRatio(hex, DARK_BG),
        `"${text}" at ${hex} on the header band`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('is measuring against a floor that can actually fail', () => {
    /*
     * The premise the sweep rests on, and the correction worth writing down: the description line
     * was `zinc-500`, which is **4.12:1** here. Under 4.5, but *nowhere near* as far under as the
     * 3.31:1 the same shade scores over the topo composite one section down — so a reviewer
     * carrying the page figure to this band would have been reading a number 0.8 too pessimistic,
     * and one carrying this band's figure downward would have been 0.8 too generous. `zinc-400` is
     * 7.76:1 here and clears with room.
     */
    expect(contrastRatio(ZINC['500']!, DARK_BG)).toBeCloseTo(4.12, 2);
    expect(contrastRatio(ZINC['500']!, DARK_BG)).toBeLessThan(MIN_CONTRAST);
    expect(contrastRatio(ZINC['400']!, DARK_BG)).toBeCloseTo(7.76, 2);
  });
});
