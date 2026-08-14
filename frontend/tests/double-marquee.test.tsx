import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DoubleMarquee } from '@/components/candy/double-marquee';

// Testing reduced motion, the only recipe verified to work in this repo: `useReducedMotion`
// caches its answer in a
// module-global on the *first* call and never re-reads `window.matchMedia`, so a test can't
// drive it through matchMedia at all. Partial-mocking the module and flipping this flag per test
// is the only way that has been verified to work in this repo.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

describe('DoubleMarquee', () => {
  it('renders both texts, in the DOM before any animation starts', () => {
    render(<DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />);

    expect(screen.getAllByText('lights out').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AND AWAY WE GO').length).toBeGreaterThan(0);
  });

  it('duplicates each line exactly twice, which is what the -50% keyframe assumes', () => {
    // tailwind.config.ts's `marquee-left`/`marquee-right` translate the track by exactly half of
    // itself. That only lands the loop invisibly if the track holds its content exactly twice —
    // one copy too few and the "loop" is really a slide-then-snap; one too many and half the
    // translate distance is wrong. This pins the count, not just "the text is present".
    render(<DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />);

    expect(screen.getAllByText('lights out')).toHaveLength(2);
    expect(screen.getAllByText('AND AWAY WE GO')).toHaveLength(2);
  });

  it('gives the two lines opposite marquee animation classes', () => {
    // Opposite classes are what makes the two rows genuinely counter-scroll rather than move as
    // one banner. Asserting the exact class names (not just "different from each other") pins
    // that these are the shared keyframes from tailwind.config.ts and not a pair invented here.
    const { container } = render(
      <DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />,
    );

    const leftTrack = container.querySelector('.animate-marquee-left');
    const rightTrack = container.querySelector('.animate-marquee-right');

    expect(leftTrack).not.toBeNull();
    expect(rightTrack).not.toBeNull();
    // The two animated tracks must be different elements — one line moving each way, not one
    // element carrying (and fighting over) both animation classes.
    expect(leftTrack).not.toBe(rightTrack);
  });

  it('the top line carries the muted serif-italic treatment, the bottom the ink display one', () => {
    render(<DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />);

    const top = screen.getAllByText('lights out')[0]!;
    const bottom = screen.getAllByText('AND AWAY WE GO')[0]!;

    expect(top.className).toMatch(/font-serif-display/);
    expect(top.className).toMatch(/italic/);
    expect(bottom.className).toMatch(/font-display/);
    expect(bottom.className).toMatch(/uppercase/);
    expect(bottom.className).toMatch(/text-ink/);
  });

  it('is decorative: aria-hidden and unable to intercept a click', () => {
    const { container } = render(
      <DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />,
    );
    const root = container.firstChild as HTMLElement;

    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.classList.contains('pointer-events-none')).toBe(true);
  });

  it('gives each track a stable, non-wrapping width so the translate has a fixed basis', () => {
    // `w-max` lets the track shrink-to-fit its two children instead of being pinned to the
    // viewport's width; `whitespace-nowrap` stops a long line from wrapping onto a second line,
    // which would give the track an unstable height. Either bug leaves the `-50%` in the
    // keyframe referring to the wrong amount of content.
    const { container } = render(
      <DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />,
    );
    const tracks = container.querySelectorAll('.animate-marquee-left, .animate-marquee-right');

    expect(tracks).toHaveLength(2);
    for (const track of Array.from(tracks)) {
      expect(track.classList.contains('w-max')).toBe(true);
      expect(track.classList.contains('whitespace-nowrap')).toBe(true);
    }
  });

  it('under reduced motion, neither track carries a marquee animation class', () => {
    reduceMotion = true;
    const { container } = render(
      <DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />,
    );

    expect(container.querySelector('.animate-marquee-left')).toBeNull();
    expect(container.querySelector('.animate-marquee-right')).toBeNull();
  });

  it('under reduced motion, both texts are still present — the static state is not empty', () => {
    reduceMotion = true;
    render(<DoubleMarquee topText="lights out" bottomText="AND AWAY WE GO" />);

    // The duplicate copy is redundant once nothing moves, but the spec deliberately keeps it so
    // the animated and static branches share one structure — so the count stays 2, not 1.
    expect(screen.getAllByText('lights out')).toHaveLength(2);
    expect(screen.getAllByText('AND AWAY WE GO')).toHaveLength(2);
  });

  it('lets a className extend the root without dropping pointer-events-none', () => {
    const { container } = render(
      <DoubleMarquee
        topText="lights out"
        bottomText="AND AWAY WE GO"
        className="absolute inset-x-0"
      />,
    );
    const root = container.firstChild as HTMLElement;

    expect(root.classList.contains('absolute')).toBe(true);
    expect(root.classList.contains('pointer-events-none')).toBe(true);
  });
});
