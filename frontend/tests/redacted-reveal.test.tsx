import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedactedReveal } from '@/components/candy/redacted-reveal';

// See `SHARED.md`'s "Testing reduced motion" recipe: `useReducedMotion` caches its answer in
// a module-global on first call and reads `(prefers-reduced-motion)`, not the `: reduce`
// variant `tests/setup.ts` stubs `matchMedia` with — so it cannot be driven through
// `matchMedia` at all. Partial-mocking the module and flipping this flag is the only way this
// repo has found to control it per-test.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** Every `aria-hidden="true"` node this component renders is a redaction bar — nothing else
 *  in its output carries that attribute — so counting them is the same as counting bars. */
const bars = (container: HTMLElement) => container.querySelectorAll('[aria-hidden="true"]');

describe('RedactedReveal', () => {
  it('renders its child in the DOM immediately, before any animation resolves', () => {
    // No `await`, no timer advance: if this passes, the content was never gated behind a
    // scroll/mount effect. Default trigger is "onView".
    render(<RedactedReveal>Constructor entry fee</RedactedReveal>);

    expect(screen.getByText('Constructor entry fee')).toBeInTheDocument();
  });

  it('renders its child immediately under trigger="immediate" too', () => {
    render(<RedactedReveal trigger="immediate">$15,000,000</RedactedReveal>);

    expect(screen.getByText('$15,000,000')).toBeInTheDocument();
  });

  it('never gates children on trigger or viewport state', () => {
    // Same assertion made two more ways, because this is the one invariant the spec calls
    // out by name ("Children are always in the DOM from first render") — a regression here
    // is a worst-case of lost content, not a cosmetic animation glitch.
    const { rerender } = render(<RedactedReveal trigger="onView">Line A</RedactedReveal>);
    expect(screen.getByText('Line A')).toBeInTheDocument();

    rerender(<RedactedReveal trigger="immediate">Line A</RedactedReveal>);
    expect(screen.getByText('Line A')).toBeInTheDocument();
  });

  it('gives a single child exactly one bar', () => {
    const { container } = render(<RedactedReveal>Solo stat</RedactedReveal>);

    expect(bars(container)).toHaveLength(1);
  });

  it('gives each top-level child its own bar', () => {
    const { container } = render(
      <RedactedReveal>
        <span>Line one</span>
        <span>Line two</span>
        <span>Line three</span>
      </RedactedReveal>,
    );

    expect(bars(container)).toHaveLength(3);
    expect(screen.getByText('Line one')).toBeInTheDocument();
    expect(screen.getByText('Line two')).toBeInTheDocument();
    expect(screen.getByText('Line three')).toBeInTheDocument();
  });

  it('derives the staircase from index, so identical children render identical bar geometry', () => {
    // Hydration-mismatch guard: the bar width/x-offset staircase is documented as deterministic
    // (index-keyed, not `Math.random()`) specifically because the server and client render
    // must agree byte-for-byte. This renders the same multi-line input twice and pins the
    // *cause* — the per-bar inline style, where the geometry actually lives — rather than a
    // symptom like a snapshot of the whole tree.
    const children = (
      <RedactedReveal>
        <span>Alpha</span>
        <span>Beta</span>
        <span>Gamma</span>
        <span>Delta</span>
      </RedactedReveal>
    );

    const first = render(children).container;
    const second = render(children).container;

    const styles = (container: HTMLElement) =>
      Array.from(bars(container)).map((bar) => bar.getAttribute('style'));

    expect(styles(first)).toEqual(styles(second));
    // And it is actually a staircase, not four identical bars: at least one pair of lines
    // has to differ, or the "deterministic" geometry would be deterministically flat.
    expect(new Set(styles(first)).size).toBeGreaterThan(1);
  });

  it('marks every bar aria-hidden and unable to intercept pointer events', () => {
    const { container } = render(
      <RedactedReveal>
        <span>Line one</span>
        <span>Line two</span>
      </RedactedReveal>,
    );

    for (const bar of Array.from(bars(container))) {
      expect(bar).toHaveAttribute('aria-hidden', 'true');
      expect(bar.classList.contains('pointer-events-none')).toBe(true);
    }
  });

  it('renders the static final state under reduced motion: no bar, text present', () => {
    reduceMotion = true;
    const { container } = render(
      <RedactedReveal>
        <span>Line one</span>
        <span>Line two</span>
      </RedactedReveal>,
    );

    expect(bars(container)).toHaveLength(0);
    expect(screen.getByText('Line one')).toBeInTheDocument();
    expect(screen.getByText('Line two')).toBeInTheDocument();
  });

  it('renders the requested element type per line via `as`', () => {
    const { container } = render(
      <RedactedReveal as="h2">
        <span>Only line</span>
      </RedactedReveal>,
    );

    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent('Only line');
  });

  it('uses the accent (f1-red) bar colour by default and ink when asked', () => {
    const { container: accentContainer } = render(<RedactedReveal>Default</RedactedReveal>);
    expect(bars(accentContainer)[0]).toHaveClass('bg-brand');

    const { container: inkContainer } = render(
      <RedactedReveal variant="ink">Quieter</RedactedReveal>,
    );
    expect(bars(inkContainer)[0]).toHaveClass('bg-ink');
  });
});
