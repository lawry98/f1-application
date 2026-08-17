import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingFeatures } from '@/components/landing/landing-features';
import { cardSurfaceBackdrop, contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { detach, restingTextNeutrals, whiteWashSurfaces } from './zinc';

// `whiteWashSurfaces` and `detach` are shared with `landing-hero` and `landing-cta-band` and live
// in `./zinc`; this section's washed surfaces are the six cards and the six icon tiles nested
// inside them, all `bg-white/[0.03]`.

/**
 * The six features, copied out of the component by hand *on purpose*.
 *
 * Importing `FEATURES` from the source would make every assertion below tautological — the test
 * would agree with whatever the component happens to say today, including after someone truncates
 * a description. These strings are the contract the Phase 3 restyle promised not to touch, so they
 * are pinned here independently and a divergence has to be reconciled deliberately.
 */
const FEATURE_TITLES = [
  'Live Streaming Briefing',
  'Tool Trace Transparency',
  'Historical F1 Telemetry',
  'Driver & Team Form',
  'Race Weather Forecast',
  'Interactive Car Anatomy',
];

const FEATURE_DESCRIPTIONS = [
  'Watch the briefing generate word-by-word via server-sent events. No waiting for a full response — intelligence streams to you the moment it is ready.',
  'See exactly which tools the AI agent executed, in what order, and whether each succeeded. No black box — full visibility into every data-gathering step.',
  'Powered by FastF1: lap times, race results, track profiles, qualifying data, and circuit records going back decades — all available without an API key.',
  'Current championship standings, recent race pace, and head-to-head driver context synthesised into every briefing. Know who is peaking before qualifying.',
  'OpenWeather integration pulls the race-weekend forecast for the correct circuit location — temperature, humidity, wind, and conditions that could shape strategy.',
  'Scroll through 192 high-res animation frames to reveal what is hidden inside a 2024 F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
];

describe('LandingFeatures', () => {
  describe('content survives the restyle', () => {
    /**
     * This is the assertion the whole file exists for. A restyle touches every line of markup in
     * the section, and the failure mode nobody notices in review is a paragraph quietly lost while
     * the layout is being rearranged — the page still renders, still looks plausible, and is
     * missing a feature. Titles *and* descriptions, all twelve strings, verbatim.
     */
    it('renders all six feature titles and all six descriptions', () => {
      render(<LandingFeatures />);

      for (const title of FEATURE_TITLES) {
        expect(screen.getByText(title)).toBeInTheDocument();
      }
      for (const description of FEATURE_DESCRIPTIONS) {
        expect(screen.getByText(description)).toBeInTheDocument();
      }
    });

    it('keeps the kicker and the supporting line', () => {
      render(<LandingFeatures />);

      expect(screen.getByText('What you get')).toBeInTheDocument();
      expect(
        screen.getByText('One query. Multiple sources. One authoritative briefing.'),
      ).toBeInTheDocument();
    });
  });

  describe('anchor and labelling contract', () => {
    it('keeps id="features", which the nav links to', () => {
      // `components/landing/links.ts` points the nav at `#features`. Renaming this id breaks a
      // link that no test outside this one would notice, because the nav renders fine either way.
      const { container } = render(<LandingFeatures />);

      expect(container.querySelector('section#features')).toBeInTheDocument();
    });

    it('labels the section with the heading it points at', () => {
      const { container } = render(<LandingFeatures />);
      const section = container.querySelector('section#features')!;
      const labelledBy = section.getAttribute('aria-labelledby');

      expect(labelledBy).toBe('features-heading');
      // Resolving the reference is the part that matters: an `aria-labelledby` pointing at an id
      // that no longer exists is silently worse than no label at all, and the attribute alone
      // cannot tell you which happened.
      expect(container.querySelector(`#${labelledBy}`)).toBe(
        screen.getByRole('heading', { level: 2 }),
      );
    });
  });

  describe('mixed-type heading', () => {
    it('reads as one sentence despite being split across spans', () => {
      render(<LandingFeatures />);
      const heading = screen.getByRole('heading', { level: 2 });

      // The accent run ("race weekend") is its own `<span>`, so a naive
      // `getByText('Everything for a complete race weekend picture.')` finds nothing — testing
      // library matches per element, and no single element holds the whole string. Normalising
      // `textContent` is what proves the sentence still reads correctly once the spans are
      // flattened, which is what a screen reader and a copy-paste both actually get.
      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Everything for a complete race weekend picture.',
      );
    });

    it('sets the accent run as its own element so the caps/serif contrast is possible', () => {
      render(<LandingFeatures />);
      const heading = screen.getByRole('heading', { level: 2 });

      // Not a style assertion — jsdom applies no stylesheet. It asserts the *structure* the
      // treatment requires: the accent words have to be a separate element to be able to carry a
      // different face and case at all. Inlining them back into the h2 text would pass every
      // content test above while losing the entire treatment.
      const accent = Array.from(heading.querySelectorAll('span')).find(
        (span) => span.textContent === 'race weekend',
      );

      expect(accent).toBeDefined();
    });
  });

  describe('feature cards', () => {
    it('renders six of them', () => {
      render(<LandingFeatures />);

      // Counted by role, not by a class name: the grid is a `ul` of `li`, so the item count is a
      // structural fact that survives any amount of Tailwind churn. A `.grid > div` query would
      // break the moment the layout classes change, which is precisely what a restyle does.
      expect(screen.getAllByRole('listitem')).toHaveLength(6);
    });

    it('gives each card its own icon chip', () => {
      const { container } = render(<LandingFeatures />);

      // All six lucide icons are meaningful and all six were kept; one `svg` per card is the
      // cheapest way to catch a chip that lost its icon during the restyle.
      const items = screen.getAllByRole('listitem');
      for (const item of items) {
        expect(item.querySelectorAll('svg')).toHaveLength(1);
      }
      expect(container.querySelectorAll('li svg')).toHaveLength(6);
    });
  });

  describe('decorative marks', () => {
    it('hides every tick bar and icon from assistive tech', () => {
      const { container } = render(<LandingFeatures />);

      // Seven red marks: one in the kicker, six in the icon chips. They carry colour and rhythm
      // and no meaning, so each must be `aria-hidden` — an unhidden empty `<span>` is announced
      // as nothing at all by some screen readers and as noise by others.
      // `Array.from` rather than iterating the NodeList directly: this project's tsconfig targets
      // below es2015, so a `for…of` over a NodeList is a TS2802 typecheck error.
      const ticks = Array.from(container.querySelectorAll('.bg-f1-red'));
      expect(ticks).toHaveLength(7);
      for (const tick of ticks) {
        expect(tick).toHaveAttribute('aria-hidden', 'true');
      }

      for (const icon of Array.from(container.querySelectorAll('svg'))) {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      }
    });
  });

  describe('resting contrast', () => {
    /*
     * The kicker's own comment records why it is grey — #E10600 on #09090B is 4.01:1, under the
     * 4.5:1 small-text bar — but a comment is not checked by anything, and a `zinc-500` regression
     * shipped and survived a phase review elsewhere on this branch on exactly that basis. These
     * read each resting `text-zinc-N` back to the hex Tailwind paints and assert the ratio, split
     * by the background actually behind the glyphs.
     */
    it('holds the section header neutrals above AA on bare `base`', () => {
      const { container } = render(<LandingFeatures />);
      detach(whiteWashSurfaces(container));
      const neutrals = restingTextNeutrals(container);

      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('holds every card neutral above AA against the card wash, not the page', () => {
      const { container } = render(<LandingFeatures />);
      const surfaces = whiteWashSurfaces(container);
      // Twelve: six cards, six icon tiles. Pinned so a card losing its wash — and with it the
      // stricter background this test judges it against — cannot pass silently.
      expect(surfaces).toHaveLength(12);

      const backdrop = cardSurfaceBackdrop();
      const neutrals = restingTextNeutrals(detach(surfaces));
      // All six descriptions, at minimum. The icon tiles hold no text and contribute nothing,
      // which is correct: an icon is judged against WCAG's 3:1 non-text bar, not 4.5:1.
      expect(neutrals.length).toBeGreaterThanOrEqual(6);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, backdrop), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });
  });
});
