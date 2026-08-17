import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DriverPortrait } from '@/components/teams/driver-portrait';
import {
  contrastRatio,
  DARK_BG,
  MIN_CONTRAST,
  portraitCaptionBackdrop,
  portraitCaptionColor,
  portraitDissolve,
  portraitScrim,
  PORTRAIT_DISSOLVE_ALPHA,
  PORTRAIT_SCRIM_ALPHA,
  PORTRAIT_SCRIM_FADE_PX,
  PORTRAIT_SCRIM_TEXT_INSET,
  sectionCardBackdrop,
} from '@/lib/team-utils';
import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { detach, inlineColouredText, restingTextNeutrals, whiteWashSurfaces } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;
const leclerc = ferrari.drivers[0];
const hamilton = ferrari.drivers[1];

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * The `src` the headshot actually renders with, normalised.
 *
 * `next/image` produces two different attribute shapes and a raw compare passes for one and fails
 * for the other: a PNG is routed through `/_next/image?url=…&w=…&q=…`, while an SVG (which the
 * default loader refuses to proxy without `dangerouslyAllowSVG`) stays literal. Headshots are
 * PNGs today, so this always takes the proxied branch — the literal fallback is here so the
 * assertion keeps meaning "which file did it ask for" if that ever changes.
 * `tests/attribution-table.test.tsx` does the same thing for the credits thumbnails.
 */
function headshotSrc(container: HTMLElement): string {
  const src = container.querySelector('img')?.getAttribute('src') ?? '';
  const proxied = /\/_next\/image\?url=([^&]+)/.exec(src);
  return proxied ? decodeURIComponent(proxied[1]!) : src;
}

/**
 * The caption block — the element carrying `portraitScrim()`, found from the nationality line it
 * contains rather than by a class, so it is located the same way a reader would describe it.
 */
function captionBlock(driverNationality: string): HTMLElement {
  return screen.getByText(driverNationality).parentElement!;
}

describe('DriverPortrait', () => {
  it('renders the headshot with the driver name as alt text', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByAltText('Charles Leclerc')).toBeInTheDocument();
  });

  it('always shows name, number and nationality regardless of image state', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Monégasque')).toBeInTheDocument();
  });

  it('drops the image and keeps the plate when the headshot fails to load', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('marks the first team’s portraits as priority to avoid a blank rail on arrival', () => {
    const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} priority />);
    expect(container.querySelector('img')).toHaveAttribute('fetchpriority', 'high');
  });

  it('re-attempts the image when the driver prop changes on the same instance, even after a prior failure', () => {
    const { rerender } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();

    rerender(<DriverPortrait driver={hamilton} team={ferrari} />);

    expect(screen.getByAltText('Lewis Hamilton')).toBeInTheDocument();
  });

  // This measured the nationality line against the *page* background, which is nowhere near it:
  // the line sits inside the portrait, over a photograph, where it was as low as 1.89:1. The
  // colour it checked was right and the background was wrong — the same way the nav rail's
  // active row and the section standing line both passed while failing on screen.
  it('paints the nationality line to clear AA over the portrait, for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const driver = team.drivers[0]!;
      const { unmount } = render(<DriverPortrait driver={driver} team={team} />);
      const colour = screen.getByText(driver.nationality).style.color;
      expect(colour, `${team.shortName} nationality colour`).not.toBe('');
      expect(rgbToHex(colour), `${team.shortName}`).toBe(portraitCaptionColor(team.color));
      expect(
        contrastRatio(rgbToHex(colour), portraitCaptionBackdrop()),
        `${team.shortName} nationality ${colour}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  // A colour alone cannot fix this line: the name beside it is plain white and the short code is
  // a neutral, and neither goes through the colour layer. What makes all three readable over an
  // arbitrary headshot is the scrim, so the scrim is what gets pinned here — including the inset
  // that keeps the text out of the gradient's fade, where the guarantee does not hold.
  it('lays a scrim behind the caption and keeps the text out of its fade', () => {
    render(<DriverPortrait driver={leclerc} team={ferrari} />);
    const caption = screen.getByText('Monégasque').parentElement!;
    // jsdom drops the redundant `to bottom` keyword — it is the default direction — so allow for
    // exactly that one normalisation and pin everything else to the helper.
    expect(caption.style.background).toBe(portraitScrim().replace('to bottom, ', ''));
    expect(caption.style.background).toContain(`${PORTRAIT_SCRIM_FADE_PX}px`);
    expect(parseFloat(caption.style.paddingTop)).toBe(PORTRAIT_SCRIM_TEXT_INSET);
    expect(PORTRAIT_SCRIM_TEXT_INSET).toBeGreaterThan(PORTRAIT_SCRIM_FADE_PX);
  });

  it('paints its dissolve from the shared gradient, not a Tailwind opacity suffix', () => {
    const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    const dissolve = container.querySelector('[data-testid="portrait-dissolve"]') as HTMLElement;
    expect(dissolve).not.toBeNull();
    // No `.replace()` here, unlike the scrim test two blocks down. jsdom drops `to bottom`
    // because it is the CSS default direction; `to top` is not the default and survives.
    expect(dissolve.style.background).toBe(portraitDissolve());
  });

  // The two darkenings are anchored to the same bottom edge. The scrim is the one that backs the
  // caption and carries the AA guarantee, so the dissolve has to stay under it — otherwise the
  // composite behind the text has a second contributor that portraitCaptionBackdrop does not
  // model, and the number the tests assert stops describing the page.
  it('keeps the dissolve weaker than the scrim it now sits beneath', () => {
    expect(PORTRAIT_DISSOLVE_ALPHA).toBeLessThan(PORTRAIT_SCRIM_ALPHA);
  });

  it('keeps the fallback latched when the same failed driver is re-rendered', () => {
    const { rerender } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    fireEvent.error(screen.getByAltText('Charles Leclerc'));
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();

    rerender(<DriverPortrait driver={leclerc} team={ferrari} />);

    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.getByText('Charles Leclerc')).toBeInTheDocument();
  });

  it('asks for the driver’s own headshot file', () => {
    // Complements the alt-text test above: `getByAltText` proves *an* image is there, not that it
    // points at this driver's asset. See `headshotSrc` for why the raw attribute cannot be
    // compared directly.
    const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
    expect(headshotSrc(container)).toBe('/drivers/charles-leclerc.png');
  });

  describe('the TicketCard treatment', () => {
    // `.notch-card` and `bg-white/[0.03]` are `TicketCard`'s own classes, not ones this component
    // authors, so counting them ties the assertion to "a TicketCard really wraps the portrait"
    // rather than to markup this file is free to change. One card, not two: the portrait is a
    // single stub, and a nested card would double the border and the wash.
    it('wraps the portrait in exactly one notched ticket card', () => {
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
      expect(container.querySelectorAll('.notch-card')).toHaveLength(1);
    });

    // Doubles as proof that the surface really is the alpha `sectionCardBackdrop()` composites:
    // `whiteWashSurfaces` pins `bg-white/[0.02|0.03]` in its pattern deliberately, so a card
    // repainted at some other alpha drops out of this list instead of being measured against a
    // backdrop that no longer describes it.
    it('paints the white-wash card surface the backdrop helper assumes', () => {
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
      const surfaces = whiteWashSurfaces(container);

      expect(surfaces).toHaveLength(1);
      expect(surfaces[0]!.classList.contains('notch-card')).toBe(true);
    });

    /**
     * Two failures in one assertion, both silent.
     *
     * `TicketCard`'s inner content wrapper is `height: auto`, so neither `absolute inset-0` nor
     * `h-full` gives the `fill` image a height — both collapse to a 0-tall box that renders as an
     * empty card rather than as an error. The image box therefore states its own ratio, and this
     * pins that it still does.
     *
     * It is written as `aspect-[300/400]` (the headshots' pixel dimensions) rather than as the
     * `aspect-[3/4]` the call site passes, because `team-section.test.tsx` identifies a portrait in
     * the section tree by that exact call-site class and asserts there are two of them. A tidy-up
     * that unified the two strings would leave this component correct and that count at four.
     */
    it('sizes the image box itself, without re-using the call site’s marker class', () => {
      const { container } = render(
        <DriverPortrait driver={leclerc} team={ferrari} className="aspect-[3/4] w-full" />,
      );
      const all = Array.from(container.querySelectorAll('*'));

      const callSiteMarkers = all.filter((el) => el.classList.contains('aspect-[3/4]'));
      expect(callSiteMarkers).toHaveLength(1);
      expect(callSiteMarkers[0]!.classList.contains('notch-card')).toBe(true);

      const imageBox = all.filter((el) => el.classList.contains('aspect-[300/400]'));
      expect(imageBox).toHaveLength(1);
      // `relative` as well as sized: a `fill` image needs a positioned parent, and the caption and
      // ghost numeral are both absolutely positioned against this same box.
      expect(imageBox[0]!.classList.contains('relative')).toBe(true);
      expect(imageBox[0]!.contains(screen.getByAltText('Charles Leclerc'))).toBe(true);
    });

    // The bug this catches has shipped once on this branch already: `TopoBackground` strokes
    // `currentColor`, so an instance with no text colour resolves to black on a near-black page —
    // invisible, and indistinguishable in a screenshot from a correctly coloured one, because
    // there is nothing wrong to see. The card supplies the colour; this asserts it survives.
    it('carries a coloured, aria-hidden topo texture from the card', () => {
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
      const svg = container.querySelector('svg')!;

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.classList.contains('text-ink')).toBe(true);
    });
  });

  describe('the ghost race numeral', () => {
    it('is decoration, and the accessible car number is exactly one node', () => {
      // A screen reader announcing the race number twice is the regression here — the numeral is
      // painted type and the `sr-only` span is the fact. Rather than trusting the two known
      // elements, this counts *every* element whose own text mentions the number and that is not
      // inside an `aria-hidden` subtree, so a third copy added later fails rather than passing
      // unnoticed. Leclerc is used because 16 appears nowhere else in his card.
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);

      const ghost = screen.getByText('16');
      expect(ghost).toHaveAttribute('aria-hidden', 'true');
      expect(ghost.className).toContain('pointer-events-none');

      const announced = Array.from(container.querySelectorAll('*')).filter(
        (el) =>
          Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && /16/.test(n.textContent ?? ''),
          ) && !el.closest('[aria-hidden="true"]'),
      );
      expect(announced).toHaveLength(1);
      expect(announced[0]!.textContent).toBe('Car number 16');
      expect(announced[0]!.className).toContain('sr-only');
    });

    // The numeral is a watermark over the photograph and the *signature* element of the fallback
    // card, which is a different job at a different strength: with no headshot there is nothing
    // else on the card to carry it. Asserting the relationship rather than the two literals keeps
    // this from failing on a taste adjustment while still failing if the branches are swapped —
    // which would leave the empty card looking blank and the photograph looking stamped.
    it('is stronger on the fallback card than over a photograph', () => {
      render(<DriverPortrait driver={leclerc} team={ferrari} />);
      const overPhoto = Number(screen.getByText('16').style.opacity);

      fireEvent.error(screen.getByAltText('Charles Leclerc'));
      const overFallback = Number(screen.getByText('16').style.opacity);

      expect(overPhoto).toBeGreaterThan(0);
      expect(overFallback).toBeGreaterThan(overPhoto);
    });

    // Paint order is the whole mechanism, and it is invisible to every other assertion in this
    // file. The headshots are opaque (`sips -g hasAlpha` reports `hasAlpha: no`) and the image is
    // `fill` + `object-cover`, so a numeral moved below the `<Image>` would not read as ghostly,
    // it would be gone — with no test failing. Both siblings are in the same stacking context at
    // `z-index: auto`, so tree order decides: image first, numeral after it, caption last.
    it('paints after the image and before the caption scrim', () => {
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      const image = screen.getByAltText('Charles Leclerc');
      const ghost = screen.getByText('16');
      const caption = captionBlock('Monégasque');

      expect(container.contains(image)).toBe(true);
      expect(image.compareDocumentPosition(ghost) & FOLLOWING).toBeTruthy();
      expect(ghost.compareDocumentPosition(caption) & FOLLOWING).toBeTruthy();
    });
  });

  describe('contrast', () => {
    // The class-reading `restingTextNeutrals` cannot see this line at all — the livery arrives as
    // an inline `style={{ color }}` — which is exactly why `inlineColouredText` exists. It is not
    // filtered to team colours, so a call site painting a raw livery onto text (the mistake
    // CLAUDE.md records this page shipping twice) turns up here as a failing ratio rather than as
    // an absence. All eleven teams, because only seven of the liveries fail on this backdrop and
    // testing one proves nothing about the other ten.
    it('clears AA on every inline-coloured run, for all eleven teams', () => {
      expect(TEAMS).toHaveLength(11);
      const backdrop = portraitCaptionBackdrop();

      for (const team of TEAMS) {
        const driver = team.drivers[0];
        const { container, unmount } = render(<DriverPortrait driver={driver} team={team} />);
        const runs = inlineColouredText(container);

        // One run, the nationality line. Pinned rather than left open: a second inline-coloured
        // run appearing here is a colour decision nobody reviewed, and it would otherwise be
        // measured silently against the caption backdrop whether or not it sits on the scrim.
        expect(runs, `${team.shortName} inline runs`).toHaveLength(1);
        expect(runs[0]!.text).toBe(driver.nationality);
        expect(
          contrastRatio(runs[0]!.hex, backdrop),
          `${team.shortName} ${runs[0]!.hex} behind "${runs[0]!.text}"`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
        unmount();
      }
    });

    /**
     * Neutrals, split by the background each run actually has.
     *
     * Two regimes meet inside this one component and measuring either against the other's backdrop
     * is the "right colour, wrong background" failure this page has shipped twice:
     *
     *   - under the scrim → `portraitCaptionBackdrop()`, the scrim over the brightest pixel a
     *     photograph could hold. The section's gradient and glow are irrelevant there.
     *   - anywhere else on the card → `sectionCardBackdrop(team.color)`, the card's white wash over
     *     the section's gradient-and-glow stack, which is the worst case a driver card can sit on.
     *
     * The off-scrim group is empty today and is pinned at zero rather than skipped, because "no
     * runs" and "runs nobody measured" look identical from a passing test. The loop below it still
     * runs, so the first neutral placed outside the caption is judged the moment it appears.
     */
    it('judges each neutral against the background it really has, for all eleven teams', () => {
      for (const team of TEAMS) {
        const driver = team.drivers[0];
        const { container, unmount } = render(<DriverPortrait driver={driver} team={team} />);

        // `detach` moves the caption out of the container, so what is left is everything *not* on
        // the scrim, and hands back a holder that *contains* the caption (rather than being it) —
        // `restingTextNeutrals` walks descendants and excludes the node it is given.
        const onScrim = restingTextNeutrals(detach([captionBlock(driver.nationality)]));
        const offScrim = restingTextNeutrals(container);

        expect(onScrim.length, `${team.shortName} scrim neutrals`).toBeGreaterThan(0);
        for (const { hex, text } of onScrim) {
          expect(
            contrastRatio(hex, portraitCaptionBackdrop()),
            `${team.shortName} ${hex} behind "${text}"`,
          ).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }

        expect(offScrim, `${team.shortName} off-scrim neutrals`).toHaveLength(0);
        for (const { hex, text } of offScrim) {
          expect(
            contrastRatio(hex, sectionCardBackdrop(team.color)),
            `${team.shortName} ${hex} behind "${text}"`,
          ).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
        unmount();
      }
    });

    // The premise the split above rests on, asserted rather than assumed. Both backdrops are
    // lighter than the bare page, so for a light-on-dark neutral they can only score at or below
    // `DARK_BG` — if a future surface change inverted that, the assertions above would quietly
    // become the lenient ones and stop catching anything. Haas is included by iterating all
    // eleven: its `#ffffff` livery is the worst case both helpers are calibrated against.
    it('is right that both real backdrops are stricter than the bare page', () => {
      const { container } = render(<DriverPortrait driver={leclerc} team={ferrari} />);
      const neutrals = restingTextNeutrals(container);

      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(
          contrastRatio(hex, portraitCaptionBackdrop()),
          `${hex} behind "${text}" on the scrim`,
        ).toBeLessThanOrEqual(contrastRatio(hex, DARK_BG));
        for (const team of TEAMS) {
          expect(
            contrastRatio(hex, sectionCardBackdrop(team.color)),
            `${hex} behind "${text}" on ${team.shortName}'s card`,
          ).toBeLessThanOrEqual(contrastRatio(hex, DARK_BG));
        }
      }
    });
  });
});
