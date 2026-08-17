import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LandingMarqueeBand } from '@/components/landing/landing-marquee-band';
import { restingTextNeutrals } from './zinc';

/**
 * The band is decorative, so almost everything worth asserting here is about what it must *not*
 * contribute to the page: no heading, no landmark, no id, no horizontal overflow.
 */
describe('LandingMarqueeBand', () => {
  it('renders both marquee strings, twice each', () => {
    render(<LandingMarqueeBand />);

    // Two matches per string is correct, not a bug. `DoubleMarquee` renders each line's text
    // twice inside a `w-max` track and the `animate-marquee-*` keyframes translate that track by
    // exactly -50%, so the second copy lands where the first started and the loop has no visible
    // seam. A `getByText` here would throw "found multiple elements" and the obvious "fix" —
    // deduplicating the track — silently breaks the animation's geometry.
    expect(screen.getAllByText('lights out')).toHaveLength(2);
    expect(screen.getAllByText('AND AWAY WE GO')).toHaveLength(2);
  });

  it('contributes no heading and no landmark to the document', () => {
    const { container } = render(<LandingMarqueeBand />);

    // `hidden: true` is the load-bearing option. The default role query already skips anything
    // under `aria-hidden`, and this whole band is aria-hidden at its leaves — so the default
    // would pass even if someone dropped an `<h2>` in here. Including hidden nodes is what makes
    // this assertion actually test the markup rather than the query's own filtering.
    expect(screen.queryAllByRole('heading', { hidden: true })).toHaveLength(0);
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();

    // No landmark either: the band must not read as a peer of `#features` / `#how-it-works` in
    // the document outline. A `<section>` with an accessible name would become a `region`.
    expect(screen.queryAllByRole('region', { hidden: true })).toHaveLength(0);
    expect(container.querySelector('section, nav, header, footer, aside, main')).toBeNull();

    // And no id: `components/landing/links.ts` is the complete list of nav anchor targets, and an
    // id here would invite someone to link to a band that is not a section of the page.
    expect(container.querySelector('[id]')).toBeNull();
  });

  it('marks the glow overlay decorative and click-through', () => {
    const { container } = render(<LandingMarqueeBand />);

    const band = container.firstElementChild;
    // The overlay is authored before the marquee so it paints underneath without a z-index.
    const glow = band?.firstElementChild;
    expect(glow).not.toBeNull();

    expect(glow).toHaveAttribute('aria-hidden', 'true');
    // `pointer-events-none` is not cosmetic: the glow is `absolute inset-0`, so it covers the
    // full band and would otherwise swallow clicks aimed at whatever sits in the same stacking
    // area. jsdom does no hit testing, so the class is the only observable.
    expect(glow).toHaveClass('pointer-events-none');
    expect(glow?.querySelector('.blur-3xl')).not.toBeNull();
  });

  it('clips the marquee track on the outer wrapper', () => {
    const { container } = render(<LandingMarqueeBand />);

    // The most likely defect in this component: `DoubleMarquee`'s track is twice the viewport
    // width by construction, and without clipping here the page gains a horizontal scrollbar at
    // every viewport size. jsdom lays nothing out — no scroll width, no computed styles — so it
    // can never observe that scrollbar. Asserting the class itself is the closest available
    // proxy, which is why this test looks tautological and is not.
    expect(container.firstElementChild).toHaveClass('overflow-hidden');
  });

  it('reads no neutral text out to anyone, so nothing here is under a contrast bar', () => {
    /*
     * The inverse of the contrast assertion the other landing sections carry, because this band
     * is the one section that has no accessible text at all.
     *
     * It is not a vacuous test. `DoubleMarquee` paints its top line `text-zinc-600` — #52525b on
     * `base` #09090B, **2.57:1** — which would fail AA outright if it were content. It is not:
     * the component sets `aria-hidden="true"` on its own root, the words are the F1 race-start
     * call rather than information, and the type is 7vw. Stripping the hidden subtrees and finding
     * nothing left is what says "this band contributes no text a contrast bar applies to". Add one
     * accessible word here and this fails, which is the moment to measure it properly.
     *
     * The `zinc-600` line itself lives in `components/candy/double-marquee.tsx` and is that
     * component's call to make, not this section's.
     */
    const { container } = render(<LandingMarqueeBand />);
    Array.from(container.querySelectorAll('[aria-hidden="true"]')).forEach((el) => el.remove());

    expect(restingTextNeutrals(container)).toHaveLength(0);
  });
});
