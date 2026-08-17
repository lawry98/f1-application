import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LandingFooter } from '@/components/landing/landing-footer';
import { NAV_LINKS } from '@/components/landing/links';
import { contrastRatio, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

/**
 * `base-warm`, resolved out of `tailwind.config.ts`.
 *
 * Not `DARK_BG`, and the difference is the whole point of this constant existing. The footer's
 * landmark is `bg-base` but every word in it sits on the card *inside* that landmark, which is
 * `bg-base-warm` — 11 levels of red lighter. Measuring the footer's neutrals against `#09090B`
 * would report them all optimistically and pass while the rendered page failed, which is the
 * mistake `CLAUDE.md` records shipping twice on the teams pages. The card is opaque, so this is
 * the literal colour behind the glyphs and not a composite.
 */
const BASE_WARM = '#140B0B';

/** Collapse the whitespace JSX leaves between inline elements before comparing prose. */
function normalise(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

describe('LandingFooter', () => {
  /*
   * The single most valuable assertion in a restyle: every string that existed before the
   * candy pass still exists after it. Both legal lines are broken across `<a>` elements, so a
   * naive `getByText` of the whole sentence finds nothing — these read the footer's normalised
   * `textContent` instead.
   */
  it('keeps both legal paragraphs verbatim', () => {
    const { container } = render(<LandingFooter />);
    const text = normalise(container.textContent);

    expect(text).toContain('Data from FastF1 & OpenWeather. F1 car model CC BY 4.0.');
    expect(text).toContain(
      'Built with Gemini 3.6 Flash · Not affiliated with Formula 1 or the FIA.',
    );
  });

  /*
   * FastF1 and OpenWeather are attribution, i.e. a licence obligation, not decoration. Their
   * hrefs are asserted alongside their labels because a restyle that keeps the word but drops
   * the link discharges nothing — and `target="_blank"` without `rel="noopener"` is the
   * reverse-tabnabbing hole, so the pair is pinned too.
   */
  it.each([
    ['FastF1', 'https://theoehrly.github.io/Fast-F1/'],
    ['OpenWeather', 'https://openweathermap.org/'],
  ])('keeps the %s attribution link', (label, href) => {
    render(<LandingFooter />);
    const link = screen.getByRole('link', { name: label });

    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  /*
   * Derived from NAV_LINKS rather than hardcoded on purpose: the footer nav and the header nav
   * read the same array, and the failure this guards against is someone adding a route to
   * `links.ts` and the footer quietly not rendering it. Hardcoding the five current entries
   * would let exactly that through.
   */
  it('renders one link per NAV_LINKS entry', () => {
    render(<LandingFooter />);
    const nav = screen.getByRole('navigation', { name: 'Footer navigation' });

    expect(within(nav).getAllByRole('link')).toHaveLength(NAV_LINKS.length);
    for (const { href, label } of NAV_LINKS) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('stays a labelled contentinfo landmark', () => {
    // The `<footer>` element is the page's only contentinfo landmark; the restyle wraps its
    // contents in a card, and wrapping the *landmark itself* in the card would have moved the
    // role onto a plain div and lost it from the landmark list.
    render(<LandingFooter />);

    expect(screen.getByRole('contentinfo', { name: 'Site footer' })).toBeInTheDocument();
  });

  /*
   * The sign-off is content, not a flourish. `RedactedReveal` animates a bar away over the
   * text, and the rule the kit is built on is that a reveal never gates whether the text
   * exists — a stuck animation must be cosmetic, never data loss. A plain render with nothing
   * advanced is exactly the "animation never ran" case, so finding the words here is what
   * proves it.
   */
  it('renders the sign-off as real text on a plain render', () => {
    render(<LandingFooter />);

    // Literal caps in the markup, not `uppercase` — a CSS transform is paint-time and would
    // leave `textContent` as "Lights out.", which is not what a screen reader announces either.
    expect(screen.getByText('LIGHTS OUT.')).toBeInTheDocument();
    expect(screen.getByText('data in.')).toBeInTheDocument();
  });

  it('hides every decorative overlay from assistive tech', () => {
    const { container } = render(<LandingFooter />);

    // The topo texture. It is the only SVG in the footer, so finding one that is not hidden is
    // the failure.
    const topo = container.querySelector('svg');
    expect(topo).not.toBeNull();
    expect(topo).toHaveAttribute('aria-hidden', 'true');

    // The separator rule and the red brand tick carry no information; both must be hidden, and
    // `RedactedReveal`'s bars — which are `<span aria-hidden>` siblings of the text — must be
    // too, or a screen reader announces a redaction bar between the two sign-off lines.
    const separator = container.querySelector('[role="separator"]');
    expect(separator).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('holds every resting neutral above AA on the warm card', () => {
    /*
     * The footer is the densest run of 11px text on the page — the brand line, five nav links and
     * two legal paragraphs — and all of it is one shade. Until this test, that shade's contrast
     * lived only in a comment, and a comment catches nothing: a `zinc-500` regression shipped and
     * survived a phase review elsewhere on this branch. `restingTextNeutrals` maps the class back
     * to the hex Tailwind paints, so a single step down the ramp fails on the ratio.
     *
     * Resting state only, which is what the helper's own class filter enforces: the links' hover
     * colour is a different state and is allowed to sit either side of the bar.
     */
    const { container } = render(<LandingFooter />);
    const neutrals = restingTextNeutrals(container);

    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, BASE_WARM), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
