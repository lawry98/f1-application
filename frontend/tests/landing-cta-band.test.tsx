import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingCtaBand } from '@/components/landing/landing-cta-band';

/** Collapse every run of whitespace to one space and trim. See the comment on the first test. */
const normalise = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('LandingCtaBand', () => {
  /*
   * The single assertion this file exists for.
   *
   * The heading is one sentence but four DOM nodes: a display run, a serif accent run, and inside
   * that a `Scribble` wrapper around the words "one click". A `Scribble` renders
   * `<span>{children}<span aria-hidden><svg/></span></span>` — so the failure mode specific to this
   * section is the wrapper *eating* the words it annotates (children dropped, mark drawn over
   * nothing) or *duplicating* them (an sr-only copy beside a painted one, which is what
   * `TextAnimate` does elsewhere in this repo and what makes a naive `getByText` pass while the
   * page reads "one click one click away"). Comparing the whole normalised sentence catches both,
   * where a per-word query catches neither.
   *
   * Normalised because JSX puts the runs on separate source lines: React emits the literal
   * newlines and indentation between them as text nodes, so the raw `textContent` carries
   * whitespace that has nothing to do with what the user reads.
   */
  it('reads as one uninterrupted sentence despite being split across spans', () => {
    render(<LandingCtaBand />);
    const heading = screen.getByRole('heading', { level: 2 });

    expect(normalise(heading.textContent)).toBe('Your race weekend briefing, one click away.');
  });

  it('keeps the sub-paragraph copy verbatim', () => {
    // The restyle re-set the type and must not have rewritten a word of it.
    render(<LandingCtaBand />);

    expect(
      screen.getByText(
        /No setup, no account required\. Enter any Grand Prix name and receive a comprehensive AI-generated briefing in seconds\./,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the kicker copy', () => {
    render(<LandingCtaBand />);

    // The kicker is now a red bar plus the words, so the words share their element with an
    // aria-hidden span — a function matcher against the element's own text is what survives that.
    expect(
      screen.getByText(
        (_, element) => normalise(element?.textContent ?? '') === 'Ready to get started?',
        {
          selector: 'p',
        },
      ),
    ).toBeInTheDocument();
  });

  it('routes both calls to action to the pages they name', () => {
    render(<LandingCtaBand />);

    // By role, not by class: the pills are `Button asChild`, so the anchor is the real element and
    // a change of shell (button → link → whatever) must not change where the user lands.
    expect(screen.getByRole('link', { name: /Generate a Briefing/ })).toHaveAttribute(
      'href',
      '/briefing',
    );
    expect(screen.getByRole('link', { name: 'Explore Car Anatomy' })).toHaveAttribute(
      'href',
      '/teardown',
    );
  });

  it('labels the section with a heading id that actually resolves', () => {
    // `aria-labelledby` pointing at a missing id is silent — the section just loses its name. The
    // id is asserted through the *reference*, so renaming one side without the other fails here.
    const { container } = render(<LandingCtaBand />);
    const section = container.querySelector('section')!;
    const labelledBy = section.getAttribute('aria-labelledby');

    expect(labelledBy).toBe('cta-heading');
    expect(container.querySelector(`#${labelledBy}`)).toBe(
      screen.getByRole('heading', { level: 2 }),
    );
  });

  describe('the circle scribble around "one click"', () => {
    it('leaves the annotated words as readable text, not as SVG', () => {
      /*
       * The mark is an overlay, never a replacement. If "one click" ever ends up inside the
       * `<svg>` — as a `<text>` node, or because someone flattened the wrapper — the sentence
       * still *looks* right in a screenshot but is gone from the accessibility tree and from
       * find-in-page. Asserting the words live outside the SVG pins that.
       */
      const { container } = render(<LandingCtaBand />);
      const heading = screen.getByRole('heading', { level: 2 });
      const svg = heading.querySelector('svg')!;

      expect(normalise(svg.textContent)).toBe('');
      expect(within(heading).getByText('one click').closest('svg')).toBeNull();
      // And exactly one mark in the heading: a second Scribble would double the ink.
      expect(container.querySelectorAll('h2 svg')).toHaveLength(1);
    });

    it('is decorative — hidden from assistive tech and untouchable by the pointer', () => {
      // The circle overhangs its phrase by 5% each side, so a mark that could take a click would
      // sit over live text. Both flags are on the overlay span, which covers the SVG subtree.
      const heading = render(<LandingCtaBand />).container.querySelector('h2')!;
      const overlay = heading.querySelector('svg')!.parentElement!;

      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      expect(overlay.classList.contains('pointer-events-none')).toBe(true);
    });

    it('wraps only the two words it marks', () => {
      // The mark must not enclose the whole heading. Its wrapper is the SVG overlay's parent's
      // parent — the `relative inline-block` span the Scribble renders — and its own text is the
      // annotated phrase and nothing else.
      const heading = render(<LandingCtaBand />).container.querySelector('h2')!;
      const wrapper = heading.querySelector('svg')!.parentElement!.parentElement!;

      expect(normalise(wrapper.textContent)).toBe('one click');
      expect(wrapper.classList.contains('inline-block')).toBe(true);
    });
  });

  it('carries the shared background texture rather than the old dot pattern', () => {
    /*
     * `TopoBackground` is identified by its `userSpaceOnUse` pattern, which is the thing that makes
     * it tile at a fixed pixel size instead of scaling with the section. `DotPattern`, which this
     * replaced, renders a pattern too — so the assertion is on the tiling mode, not on the
     * presence of a `<pattern>`.
     */
    const { container } = render(<LandingCtaBand />);
    const pattern = container.querySelector('pattern')!;

    expect(pattern).toHaveAttribute('patternUnits', 'userSpaceOnUse');
  });

  it('keeps every decorative layer out of the accessibility tree', () => {
    // The texture and the red radial glow are both absolutely positioned siblings of the copy.
    // Either one leaking into the tree or intercepting a pointer would break the CTA it sits under.
    const { container } = render(<LandingCtaBand />);
    const section = container.querySelector('section')!;

    for (const layer of Array.from(section.children).slice(0, 2)) {
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(layer.classList.contains('pointer-events-none')).toBe(true);
    }
  });
});
