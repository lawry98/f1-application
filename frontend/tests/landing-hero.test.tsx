import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';

/**
 * Collapse runs of whitespace and trim.
 *
 * The headline is no longer one text node: `RedactedReveal` renders each of its three lines as a
 * separate element, and JSX indentation puts newlines and tabs between them, so a naive
 * `getByText('Race weekend intel, before the lights go out.')` finds nothing and
 * `heading.textContent` comes back with the source's line breaks in it. Normalising is what lets
 * the assertion be about the *sentence* rather than about the markup that happens to carry it.
 */
function normalise(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Find the single element of `tag` whose normalised text is exactly `text`. */
function byNormalisedText(tag: string, text: string) {
  return screen.getByText(
    (_content, element) =>
      element?.tagName === tag.toUpperCase() && normalise(element.textContent) === text,
  );
}

describe('LandingHero', () => {
  describe('headline', () => {
    it('is a single h1 whose text reads as one sentence', () => {
      // The restyle splits the headline across three reveal lines, and `as="h1"` on
      // `RedactedReveal` would have emitted one `h1` per line — three headings, each holding a
      // fragment. Both halves of this assertion matter: the count pins the structural choice, the
      // text pins that the sentence survived being split (in particular that each line still
      // carries the trailing space that keeps "weekend" and "intel," apart in the a11y tree).
      render(<LandingHero />);
      const headings = screen.getAllByRole('heading', { level: 1 });

      expect(headings).toHaveLength(1);
      expect(normalise(headings[0]?.textContent)).toBe(
        'Race weekend intel, before the lights go out.',
      );
    });
  });

  describe('surviving copy', () => {
    it('keeps the sub-paragraph verbatim', () => {
      render(<LandingHero />);

      expect(
        byNormalisedText(
          'p',
          'Type any Grand Prix and our AI agent gathers track telemetry, driver form, weather ' +
            'forecasts, and live news — synthesized into a structured race weekend briefing by ' +
            'Claude AI.',
        ),
      ).toBeInTheDocument();
    });

    it('keeps both CTAs pointing at the same routes', () => {
      // The buttons are `asChild` around a `next/link`, so the accessible role is `link`, not
      // `button`. Asserting the `href` too is the point of the test: a restyle that swapped the
      // class strings but fat-fingered a route would still pass a label-only assertion.
      render(<LandingHero />);

      expect(screen.getByRole('link', { name: /Generate a Briefing/ })).toHaveAttribute(
        'href',
        '/briefing',
      );
      expect(screen.getByRole('link', { name: 'Explore Car Anatomy' })).toHaveAttribute(
        'href',
        '/teardown',
      );
    });

    it('keeps the trust row', () => {
      render(<LandingHero />);

      expect(screen.getByText('Multi-source data')).toBeInTheDocument();
      expect(screen.getByText('Real-time streaming')).toBeInTheDocument();
      expect(screen.getByText('Tool trace transparency')).toBeInTheDocument();
    });
  });

  describe('briefing preview card', () => {
    it('keeps the event title', () => {
      render(<LandingHero />);

      expect(screen.getByRole('heading', { name: 'Monaco Grand Prix' })).toBeInTheDocument();
    });

    it('keeps the ready chip', () => {
      render(<LandingHero />);

      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it.each([
      ['Track', 'Circuit de Monaco · 3.337 km', '78 laps · Monte Carlo, Monaco'],
      ['Weather', 'Partly cloudy · 22°C', 'Humidity 45% · Wind 12 km/h SW'],
      ['Championship Lead', 'Max Verstappen · Red Bull Racing', '312 pts · +67 over Leclerc'],
      ['Fastest Lap Record', 'Lewis Hamilton · 1:12.909', 'Set during the 2021 Grand Prix'],
    ])('keeps the %s row intact', (label, primary, secondary) => {
      render(<LandingHero />);

      expect(screen.getByText(label)).toBeInTheDocument();
      // Normalised rather than `getByText(primary)` because the fastest-lap row's value is split
      // around a `<sup>` — `1:12` + `.909` — so its text lives in two nodes. Running every row
      // through the same matcher means the split row is asserted the same way as the intact ones,
      // and the assertion still fails if the `.909` fragment goes missing.
      expect(byNormalisedText('p', primary)).toBeInTheDocument();
      expect(byNormalisedText('p', secondary)).toBeInTheDocument();
    });

    it('raises the fastest lap thousandths as a superscript', () => {
      // The `sup` is the reason the row above needs a normalised matcher, so it is pinned
      // directly: an edit that flattened the value back to plain text would leave that test green.
      const { container } = render(<LandingHero />);
      const sup = container.querySelector('sup');

      expect(sup).toHaveTextContent('.909');
    });

    it('keeps every tool-trace label', () => {
      render(<LandingHero />);

      expect(screen.getByText('Agent tool trace')).toBeInTheDocument();
      for (const label of ['Track telemetry', 'Driver form', 'Weather forecast', 'News search']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('renders the Monaco circuit outline', () => {
      // Structural, never dimensional — jsdom lays nothing out, so the only honest question is
      // "is the map in the tree at all". The selector is `CircuitGlow`'s declared *user space*,
      // which is a fixed component constant and not a rendered size: a plain `svg[viewBox]` also
      // matches the two lucide icons, and a plain `svg` matches the `TopoBackground` textures
      // (which deliberately carry no viewBox, so a texture never magnifies with its container).
      // The `d` check is what proves the geometry import actually resolved — `CircuitGlow`
      // renders the same shell with no paths at all when it gets fewer than two points.
      const { container } = render(<LandingHero />);
      const circuit = container.querySelector('svg[viewBox="0 0 500 500"]');

      expect(circuit).not.toBeNull();
      expect(circuit?.querySelector('path')).toHaveAttribute('d', expect.stringContaining('M '));
    });
  });

  describe('decorative overlays', () => {
    it('hides every decorative layer from assistive tech', () => {
      // The hero paints four purely visual layers over the copy — the topo texture, two ambient
      // glows and the bottom fade — plus the circuit map and the reveal bars inside. None of them
      // carries meaning, so every SVG on the section and every non-interactive absolutely
      // positioned div must be `aria-hidden`; anything that is not would be announced as a stray
      // graphic between the headline and the CTAs.
      const { container } = render(<LandingHero />);

      // `closest`, not an attribute on the SVG itself: `Scribble` deliberately puts `aria-hidden`
      // on the overlay *span* that wraps its SVG (once, covering the whole subtree), so an
      // assertion on the element alone would fail on a correctly hidden mark. What matters is
      // that no SVG is reachable by assistive tech, wherever the attribute is applied.
      // `Array.from`, not a `for…of` over the NodeList: this project's `tsconfig` targets ES5 for
      // downlevel emit, so iterating a DOM collection directly is a TS2802 typecheck error.
      Array.from(container.querySelectorAll('svg')).forEach((svg) => {
        expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
      });
      Array.from(container.querySelectorAll('div.pointer-events-none, div.absolute')).forEach(
        (layer) => {
          expect(layer).toHaveAttribute('aria-hidden', 'true');
        },
      );
    });
  });
});
