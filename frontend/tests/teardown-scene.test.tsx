import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeardownScene } from '@/components/teardown/teardown-scene';

/**
 * These tests can say nothing about the scrub, the dock, or the FLIP transform. jsdom lays nothing
 * out — `getBoundingClientRect()` is all zeroes, no stylesheet applies, and no scroll ever happens —
 * so every one of those was verified in Chromium instead, at 1440 and 390, by scrubbing the range
 * and back and resizing mid-dock. What is worth pinning here is the *structure* those behaviours
 * depend on, and above all the mounting order that makes the scrub work at all.
 *
 * Note that in jsdom no preloaded frame ever fires `onload`, so the component stays in its
 * still-loading state for the whole of every test below. That is the interesting state, not a
 * limitation — see the first test.
 */

let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** Collapse runs of whitespace and trim — the title is split across two elements. */
function normalise(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

describe('TeardownScene', () => {
  it('mounts the scroll container while the frames are still loading', () => {
    const { container } = render(<TeardownScene />);

    // The single most valuable assertion in this file. Progress is driven by
    // `useScroll({ target: containerRef })`, and motion resolves that target in a layout effect
    // whose dependency array is `[start]`, where `start` closes over the ref *object* — an identity
    // that never changes. Verified in framer-motion/dist/es/value/use-scroll.mjs. So a ref that is
    // null on the render where that effect runs is never re-read when it attaches later: motion
    // raises "Target ref is defined but not hydrated" and the progress value stays pinned at 0
    // forever, which presents as a page that simply does not scrub.
    //
    // The component used to `return` a loading screen instead of the scene until all 192 frames had
    // resolved, which is exactly that shape. The loading screen is now an overlay *over* the
    // mounted container. Because motion's invariant throws rather than warns, a regression here
    // fails this test twice over — on the missing element and on the render itself.
    const scrollContainer = container.querySelector('div[style*="500vh"]');
    expect(scrollContainer).not.toBeNull();

    // …and the loading UI is present at the same time, rather than having replaced it.
    expect(screen.getByText('Loading frames')).toBeInTheDocument();
  });

  it('reserves the dock slot at a fixed size before the car needs it', () => {
    const { container } = render(<TeardownScene />);

    // The FLIP transform measures this box on mount and on every resize to work out where the car
    // is flying to. A slot that only appeared once the car had arrived could not be measured before
    // the car needed to know where to go, so it is always rendered and always this size — which is
    // also why docking costs no layout shift.
    const slot = container.querySelector('header div[style*="120px"]');
    expect(slot).not.toBeNull();
    expect(slot).toHaveStyle({ width: '120px', height: '36px' });
  });

  it('keeps the title copy, re-set as display caps plus a serif accent', () => {
    render(<TeardownScene />);

    const heading = screen.getByRole('heading', { level: 1 });
    // Asserted on the normalised textContent rather than with `getByText`, because the mixed-type
    // treatment splits one sentence across two elements and a naive text match finds neither half.
    expect(normalise(heading.textContent)).toBe('Anatomy of an F1 car');
  });

  it('exposes progress as a progressbar rather than only as decoration', () => {
    render(<TeardownScene />);

    // The visible readout is a `.text-mega` numeral at 15% opacity and is `aria-hidden` — it is
    // texture, not a readout. This is where the accessible progress actually lives, so a change
    // that drops it would silently remove the only machine-readable progress on the page.
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('keeps the callout copy when the card becomes a corner marker', () => {
    render(<TeardownScene />);

    // The restyle replaced a bordered, blurred label card with a dot-and-leader marker. Both
    // strings have to survive that — this is the assertion that proves the callout was re-set
    // rather than quietly dropped.
    expect(screen.getByText('V6 Turbo Hybrid Power Unit')).toBeInTheDocument();
    expect(
      screen.getByText('1.6L V6 turbo-hybrid — over 1000 HP combined output'),
    ).toBeInTheDocument();
  });

  it('renders the outro below the sequence', () => {
    const { container } = render(<TeardownScene />);

    // The outro is what the docked car sits above; without it the dock has no stage. Its own file
    // covers its content — this only pins that the scene actually mounts it, since the scroll
    // re-base was done specifically so that content below the sequence is possible at all.
    expect(container.querySelector('#teardown-outro')).not.toBeNull();
  });

  it('renders the whole scene under reduced motion', () => {
    reduceMotion = true;
    const { container } = render(<TeardownScene />);

    // Reduced motion changes *how* the car docks — a step and a fade rather than a scrubbed
    // interpolation — and must never change what exists. Content present, container present.
    expect(container.querySelector('div[style*="500vh"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('V6 Turbo Hybrid Power Unit')).toBeInTheDocument();
    expect(container.querySelector('#teardown-outro')).not.toBeNull();
  });
});
