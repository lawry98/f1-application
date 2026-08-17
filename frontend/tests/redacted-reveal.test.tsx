import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedactedReveal } from '@/components/candy/redacted-reveal';

// `useReducedMotion` caches its answer in a module-global on first call and reads
// `(prefers-reduced-motion)`, not the `: reduce` variant `tests/setup.ts` stubs `matchMedia`
// with — so it cannot be driven through `matchMedia` at all. Partial-mocking the module and
// flipping this flag is the only way this repo has found to control it per-test. It still works
// now that the component reads `useReducedMotionSafe`, because that hook calls motion's hook
// internally and `vi.mock` replaces the module for every importer in this file's registry.
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

  it('renders the un-reduced tree on the server, whatever the preference says', () => {
    /*
     * The regression guard for a confirmed hydration error. motion's `useReducedMotion()` answers
     * `null` during SSR and the user's *real* preference on the client's first render, and this
     * component branches structurally on it — the reduced branch omits the bar element and the
     * `motion.span` wrapper entirely — so the two passes emitted different trees. Reproduced in
     * Chromium with reduced motion emulated, on `/`:
     *
     *   Warning: Expected server HTML to contain a matching text node for "Race weekend" in <span>
     *       at RedactedReveal (components/candy/redacted-reveal.tsx)
     *
     * `useReducedMotionSafe` fixes it by contract: `false` on the server and on the first client
     * render regardless of the preference, then a layout effect flips it before paint. The server
     * string is the only place jsdom can see that contract, so this renders one with the
     * preference turned **on** and asserts the bar is still there. Revert the component to
     * motion's own hook and this markup loses its bar while the client's hydrating pass still
     * draws one — which is the bug, in the shape it actually shipped.
     */
    reduceMotion = true;
    // React logs "useLayoutEffect does nothing on the server" for the hook's isomorphic effect.
    // That is the deliberate cost of committing the flip before paint (see
    // `hooks/use-reduced-motion-safe.ts`), not something this test should fail on.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const html = renderToString(
        <RedactedReveal>
          <span>Race weekend</span>
        </RedactedReveal>,
      );

      expect(html).toContain('Race weekend');
      expect(html).toContain('aria-hidden="true"');
    } finally {
      consoleError.mockRestore();
    }
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
    // `bg-f1-red`, not the `bg-brand` alias of the same hex: identical pixels, but the branch's
    // own `grep f1-red` audits would otherwise miss the site-defining reveal bar entirely.
    const { container: accentContainer } = render(<RedactedReveal>Default</RedactedReveal>);
    expect(bars(accentContainer)[0]).toHaveClass('bg-f1-red');

    const { container: inkContainer } = render(
      <RedactedReveal variant="ink">Quieter</RedactedReveal>,
    );
    expect(bars(inkContainer)[0]).toHaveClass('bg-ink');
  });
});
