import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';
import { cardSurfaceBackdrop, contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { detach, restingTextNeutrals, whiteWashSurfaces } from './zinc';

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

// `whiteWashSurfaces` and `detach` are shared with `landing-cta-band` and `landing-features` and
// live in `./zinc`; the hero's washed surfaces are the ticket card and badge (`bg-white/[0.03]`)
// and the outline pill (`bg-white/[0.02]`).

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
    it('keeps the event title, and keeps it out of the document outline', () => {
      // The string is the part that must survive — that has not changed and must not. What changed
      // is the element carrying it: it was an `h3` under the page's only `h1`, which is an axe
      // `heading-order` violation (H1 → H3) and, worse, put a *mocked* race name into the page
      // outline as a peer of the real section headings. So the assertion now finds it by text and
      // pins both halves of the fix: the words are still rendered, and they are no longer a
      // heading at any level. `hidden: true` matters — the default heading query already skips
      // `aria-hidden` subtrees, so without it this would pass on a hidden `h3` too.
      render(<LandingHero />);

      const title = screen.getByText('Monaco Grand Prix');
      expect(title).toBeInTheDocument();
      expect(title.tagName).toBe('P');
      expect(
        screen.queryAllByRole('heading', { name: 'Monaco Grand Prix', hidden: true }),
      ).toHaveLength(0);
    });

    it('leaves the hero with exactly one heading, so the outline cannot skip a level', () => {
      // The generalisation of the assertion above: the hero contributes an `h1` and nothing else,
      // so no descendant heading can be at the wrong level relative to it. This is what fails if
      // someone "fixes" the preview card back into a heading — at *any* level, including a
      // technically-legal `h2`, which would still put demo data in the outline.
      render(<LandingHero />);

      const headings = screen.getAllByRole('heading', { hidden: true });
      expect(headings).toHaveLength(1);
      expect(headings[0]?.tagName).toBe('H1');
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

  describe('resting contrast', () => {
    /*
     * Every contrast claim on this branch lived in a comment until these tests. That is how a
     * `zinc-500` regression shipped and survived a phase review elsewhere on the branch: a comment
     * asserting 4.5:1 is not checked by anything. `restingTextNeutrals` maps each resting
     * `text-zinc-N` class back to the hex Tailwind would paint, so these measure a *ratio* rather
     * than pin a class string — swapping `zinc-400` for `zinc-500` fails on 4.12 being under 4.5,
     * which is the thing that actually matters.
     *
     * The section is split by what is actually behind the glyphs, never judged wholesale.
     */
    it('holds every neutral on bare `base` above AA', () => {
      const { container } = render(<LandingHero />);
      // Detaching the washed surfaces leaves only text sitting directly on `base`.
      detach(whiteWashSurfaces(container));
      const neutrals = restingTextNeutrals(container);

      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('holds every neutral on a white-washed surface above AA against that wash', () => {
      const { container } = render(<LandingHero />);
      const surfaces = whiteWashSurfaces(container);
      // Three: the preview card, the badge, the outline pill. Pinned so that a surface gaining or
      // losing its wash is a failure here rather than a silent change of which bar applies.
      expect(surfaces).toHaveLength(3);

      /*
       * This test used to carry an exclusion here, and it does not any more.
       *
       * `PreviewRow`'s secondary line was `text-sm text-zinc-500`, which the exclusion described
       * as ~3.9:1 against the card and left alone. Phase 7 measured it off a real 1440 screenshot
       * with those four runs' glyphs hidden — modal backdrop **#111113**, worst pixel **#251416**
       * — and got **3.90:1** and **3.65:1** for `zinc-500`, against a 4.5:1 bar for 14 px text.
       * The colour moved to `zinc-400` (**7.36:1** and **6.88:1**), so there is nothing left to
       * exclude and every run in the card is now measured by the loop below.
       *
       * The count assertion survives the exclusion it used to guard, inverted: four secondary rows
       * exist, all four are `zinc-400`, and no `zinc-500` remains anywhere in this section. Losing
       * the rows or regressing the shade both fail here rather than silently shrinking what the
       * loop covers — which is the failure the old exclusion was written to prevent.
       */
      const secondaries = Array.from(container.querySelectorAll('p.text-zinc-400.text-sm'));
      expect(secondaries).toHaveLength(4);

      /*
       * Scoped to runs that actually carry text, and deliberately not to every `.text-zinc-500` in
       * the subtree: one `aria-hidden` decorative `svg` in this section strokes `currentColor` off
       * that class. It is a graphic, held to the 3:1 non-text bar rather than 4.5:1, and sweeping
       * it up here would either fail this test for a colour that is fine or push someone to lighten
       * a decorative stroke to satisfy a text rule.
       */
      const zinc500TextRuns = Array.from(container.querySelectorAll('.text-zinc-500')).filter(
        (el) => el.textContent?.trim() && el.closest('[aria-hidden="true"]') === null,
      );
      expect(zinc500TextRuns.map((el) => el.textContent?.trim())).toEqual([]);

      const backdrop = cardSurfaceBackdrop();
      const neutrals = restingTextNeutrals(detach(surfaces));
      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, backdrop), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
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
