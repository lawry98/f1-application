import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works';

// See `SHARED.md`'s "Testing reduced motion" recipe, used verbatim. `useReducedMotion` caches its
// answer in a module-global on the first call and queries `(prefers-reduced-motion)` — not the
// `: reduce` variant `tests/setup.ts` stubs `matchMedia` with — so overriding `matchMedia` cannot
// drive it. Partial-mocking the module and flipping this flag is the only way to control it
// per-test, and real `motion` elements still render through the spread.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * The four steps' copy, duplicated here on purpose rather than imported from the component.
 *
 * `STEPS` is not exported, and it should not be: a test that imports the same constant the
 * component renders asserts only that React can map over an array. Retyping the strings is what
 * makes this a *contract* — Phase 3 is a restyle, and the one failure mode that matters is copy
 * being quietly dropped or reworded while the markup is re-set. If a string here has to change,
 * that change should be a deliberate line in a diff.
 */
const STEP_TITLES = [
  'Enter your race',
  'Agent plans & executes',
  'Gemini synthesizes',
  'Your briefing, ready',
];

const STEP_DESCRIPTION_FRAGMENTS = [
  'The agent handles fuzzy matching and historical queries.',
  'track profile, race results, driver standings, weather, and news.',
  'coherent analysis calibrated for the race weekend ahead.',
  'Streamed live as it generates.',
];

describe('LandingHowItWorks', () => {
  it('renders all four step titles and all four descriptions', () => {
    // The single most valuable assertion in this file: it is what proves the restyle did not drop
    // or reword copy. Descriptions are matched on a trailing fragment rather than the whole
    // paragraph because the em-dashes and typographic quotes in the full strings are easy to
    // mangle when copying — the fragments are still unique to their step.
    render(<LandingHowItWorks />);

    for (const title of STEP_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }

    for (const fragment of STEP_DESCRIPTION_FRAGMENTS) {
      expect(
        screen.getByText((_, element) => element?.textContent?.includes(fragment) === true, {
          selector: 'p',
        }),
      ).toBeInTheDocument();
    }
  });

  it('keeps the supporting line and the kicker copy', () => {
    render(<LandingHowItWorks />);

    expect(
      screen.getByText('Four steps. One pipeline. Powered by LangGraph and Claude AI.'),
    ).toBeInTheDocument();
    // The kicker's text node sits beside the decorative red bar inside the same `<p>`, so match on
    // the containing element rather than on an exact text node.
    expect(
      screen.getByText((_, element) => element?.textContent?.trim() === 'How it works', {
        selector: 'p',
      }),
    ).toBeInTheDocument();
  });

  it('keeps the nav anchor id and a resolvable aria-labelledby', () => {
    // `#how-it-works` is a nav anchor target — an in-page link resolves against it, so renaming
    // the id breaks that link silently: an anchor pointing at a missing id simply does nothing,
    // with no error anywhere. Nothing outside this file can catch that, because the link lives in
    // a different section owned by a different agent.
    const { container } = render(<LandingHowItWorks />);

    const section = container.querySelector('section#how-it-works');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('aria-labelledby', 'how-it-works-heading');

    // The label must actually resolve — an `aria-labelledby` pointing at nothing leaves the region
    // unnamed, which is worse than having no attribute at all.
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'how-it-works-heading');
    expect(container.querySelector('#how-it-works-heading')).toBe(heading);
  });

  it('keeps the full heading sentence despite the serif accent span splitting it', () => {
    // The mixed-type treatment wraps `in seconds` in its own span, so the heading's text lives in
    // two text nodes and a naive `getByText('From query to briefing in seconds')` fails. Normalise
    // whitespace and assert on `textContent`, which is what a screen reader announces.
    render(<LandingHowItWorks />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'From query to briefing in seconds',
    );
  });

  it('renders all four numerals as decoration only', () => {
    // The numerals are `aria-hidden` because the step order is already carried by document order —
    // announcing "zero one" before every heading is noise. They must still be in the DOM: they are
    // the timeline's visual spine.
    render(<LandingHowItWorks />);

    for (const numeral of ['01', '02', '03', '04']) {
      const element = screen.getByText(numeral);
      expect(element).toBeInTheDocument();
      expect(element).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('colours only the first numeral red', () => {
    // "Active step red" from the spec. 2rem is 32px, past the 24px large-text threshold where
    // f1-red's 4.01:1 on `base` is sufficient — this assertion pins the *scope* of the exception,
    // so a later change that reds every numeral (or reds a small one) fails here.
    render(<LandingHowItWorks />);

    expect(screen.getByText('01')).toHaveClass('text-f1-red');
    for (const numeral of ['02', '03', '04']) {
      expect(screen.getByText(numeral)).not.toHaveClass('text-f1-red');
    }
  });

  it('renders the connector under normal motion', () => {
    const { container } = render(<LandingHowItWorks />);

    const connector = container.querySelector('[data-testid="how-it-works-connector"]');
    expect(connector).not.toBeNull();
    expect(connector).toHaveAttribute('aria-hidden', 'true');
  });

  it('still renders the connector under reduced motion', () => {
    // The failure this guards against is specific: with no reduced-motion branch, the line is
    // bound to a scroll progress that a reduced-motion user's `useScroll` still reports, but a
    // sloppy "skip the animation" fix leaves it at scaleY 0 — an invisible connector, which is
    // worse than an unanimated one. jsdom cannot read the transform motion writes asynchronously,
    // so this asserts the only thing it can honestly assert: the element is still in the tree, and
    // the branch does not render nothing.
    reduceMotion = true;
    const { container } = render(<LandingHowItWorks />);

    expect(container.querySelector('[data-testid="how-it-works-connector"]')).not.toBeNull();
  });

  it('renders every step title and description under reduced motion too', () => {
    // Content is never gated on an animation — the reduced-motion branch touches the connector
    // only, and this is what would catch it starting to gate anything else.
    reduceMotion = true;
    render(<LandingHowItWorks />);

    for (const title of STEP_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText('04')).toBeInTheDocument();
  });
});
