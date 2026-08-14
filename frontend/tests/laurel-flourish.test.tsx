import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LaurelFlourish } from '@/components/candy/laurel-flourish';

/**
 * `useReducedMotion()` cannot be driven through `window.matchMedia` here — `motion` caches the
 * preference in a module-global set on its *first* call and never re-reads it, and it queries
 * `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)`, which the
 * `matchMedia` stub in `tests/setup.ts` would not match anyway. Partial-mocking the module and
 * flipping a flag is the only way to see both branches in one file. It still works now that the
 * component reads `useReducedMotionSafe`, because that hook calls motion's hook internally and
 * `vi.mock` replaces the module for every importer in this file's registry.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** All `<path>` elements in DOM order: left branch's seven, then right branch's seven. */
const pathsOf = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('path'));

describe('LaurelFlourish', () => {
  it('renders its children, in the DOM from first render', () => {
    // The flourish must never gate whether the content it flanks exists — the worst case for a
    // stuck or skipped draw-on is a missing decoration, never missing content.
    render(
      <LaurelFlourish>
        <span>DOCKED CAR</span>
      </LaurelFlourish>,
    );

    expect(screen.getByText('DOCKED CAR')).toBeInTheDocument();
  });

  it.each(['onView', 'immediate'] as const)('keeps children in the DOM with draw=%s', (draw) => {
    render(
      <LaurelFlourish draw={draw}>
        <span>DOCKED CAR</span>
      </LaurelFlourish>,
    );

    expect(screen.getByText('DOCKED CAR')).toBeInTheDocument();
  });

  it('renders without children for a call site that positions its own content', () => {
    // `children` is optional — a bare pair of branches is a valid shape too.
    const { container } = render(<LaurelFlourish />);

    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('marks both branch svgs decorative and out of the hit-test tree', () => {
    // Each `<svg>` carries these directly, deliberately *not* on a shared wrapper: the wrapper's
    // other child is the flanked content itself, which must stay accessible and clickable, unlike
    // `Scribble`'s overlay (which only ever covers its own mark).
    const { container } = render(
      <LaurelFlourish>
        <button>Click me</button>
      </LaurelFlourish>,
    );
    const svgs = Array.from(container.querySelectorAll('svg'));

    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.classList.contains('pointer-events-none')).toBe(true);
    }
    // And the guard for the mistake above: the wrapped content is not caught by either attribute.
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
    expect(button.classList.contains('pointer-events-none')).toBe(false);
  });

  it('renders the right branch as a mirrored transform of the left branch, not a second path', () => {
    // This is the property that keeps the component editable: a hand-authored mirror drifts the
    // moment either side is edited, so the right branch must be the exact same `d` strings as the
    // left, under a `<g transform>` — never independently authored geometry.
    const { container } = render(<LaurelFlourish />);
    const paths = pathsOf(container);

    // One stem + six leaf-pairs, per branch, inside the brief's "5–7 leaves per side" for a mark
    // this small.
    expect(paths).toHaveLength(14);
    const left = paths.slice(0, 7);
    const right = paths.slice(7, 14);

    for (let i = 0; i < 7; i++) {
      expect(right[i]!.getAttribute('d')).toBe(left[i]!.getAttribute('d'));
    }

    // The right branch's paths sit under an ancestor `<g>` carrying a horizontal-flip transform;
    // the left branch's do not.
    for (const path of left) {
      expect(path.closest('g[transform]')).toBeNull();
    }
    for (const path of right) {
      const mirrorGroup = path.closest('g[transform]');
      expect(mirrorGroup).not.toBeNull();
      expect(mirrorGroup!.getAttribute('transform')).toMatch(/scale\(-1,\s*1\)/);
    }
  });

  it('strokes currentColor and sets no colour of its own', () => {
    // A hard-coded hex here is the failure `topo-background.tsx` already documents: a stroke of
    // `currentColor` under an ancestor with no declared text colour resolves to black and is
    // invisible on this page's dark background. The call site must supply colour (`text-ink`).
    const { container } = render(<LaurelFlourish />);

    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      // No Tailwind text-colour utility on the svg itself — colour is entirely inherited.
      expect(svg.getAttribute('class') ?? '').not.toMatch(/(^|\s)text-/);
    }
  });

  it('draws unfilled and round-capped, matching the kit', () => {
    const { container } = render(<LaurelFlourish />);

    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke-linecap', 'round');
      expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    }
  });

  it.each(['onView', 'immediate'] as const)('starts the draw-on at zero length (%s)', (draw) => {
    // motion animates `pathLength` by setting the SVG `pathLength` attribute to 1 and expressing
    // the dash pattern as a fraction of it, so `stroke-dasharray="0 1"` on first paint *is* the
    // undrawn stroke — the same mechanism `scribble.test.tsx` pins.
    const { container } = render(<LaurelFlourish draw={draw} />);

    for (const path of pathsOf(container)) {
      expect(path).toHaveAttribute('pathLength', '1');
      expect(path.getAttribute('stroke-dasharray')).toMatch(/^0[\s,]/);
    }
  });

  it('renders both branches fully drawn and settled under reduced motion', () => {
    // The static final state: every path present, at the settled 40% opacity, with no dash
    // pattern at all — this is the branch `Scribble`'s `delay` prop got wrong once (a delay under
    // reduced motion left the mark absent rather than immediately present), so the guard here is
    // both presence *and* the absence of any half-drawn state.
    reduceMotion = true;
    const { container } = render(
      <LaurelFlourish>
        <span>DOCKED CAR</span>
      </LaurelFlourish>,
    );
    const paths = pathsOf(container);

    expect(paths).toHaveLength(14);
    for (const path of paths) {
      expect(path.getAttribute('d')).toMatch(/^M /);
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      expect(path.hasAttribute('stroke-dashoffset')).toBe(false);
      expect(path.hasAttribute('pathLength')).toBe(false);
    }

    // Settled opacity is a plain attribute on the group wrapping each branch's paths, not a
    // frozen animation left in the tree.
    const groups = Array.from(container.querySelectorAll('g[opacity]'));
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.getAttribute('opacity')).toBe('0.4');
    }

    // And the content it flanks is never hidden, whatever the animation is doing.
    expect(screen.getByText('DOCKED CAR')).toBeInTheDocument();
  });

  it('keeps the decorative attributes under reduced motion too', () => {
    // The reduced-motion branch swaps `motion.path` for plain `path` — exactly the kind of second
    // code path where `aria-hidden`/`pointer-events-none` quietly get dropped.
    reduceMotion = true;
    const { container } = render(<LaurelFlourish />);

    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.classList.contains('pointer-events-none')).toBe(true);
    }
  });

  it('merges an incoming className onto the wrapper, last', () => {
    // The call site supplies colour (`text-ink`) and any layout overrides this way.
    const { container } = render(<LaurelFlourish className="gap-4 text-ink" />);
    const wrapper = container.firstElementChild!;

    expect(wrapper.classList.contains('text-ink')).toBe(true);
    expect(wrapper.classList.contains('gap-4')).toBe(true);
    // tailwind-merge drops the component's own default `gap-2` in favour of the later class
    // rather than emitting both, which is the whole point of `cn` over a plain template string.
    expect(wrapper.classList.contains('gap-2')).toBe(false);
  });
});
