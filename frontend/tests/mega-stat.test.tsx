import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MegaStat } from '@/components/candy/mega-stat';

// See `SHARED.md`'s "Testing reduced motion" recipe: `useReducedMotion` caches its answer in a
// module-global on first call and reads `(prefers-reduced-motion)`, not the `: reduce` variant
// `tests/setup.ts` stubs `matchMedia` with — so it cannot be driven through `matchMedia` at all.
// Partial-mocking the module and flipping this flag is the only way this repo has found to
// control it per-test.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * `MegaStat` renders the numeral twice: once `invisible` (reserves the final value's width from
 * the first frame, per the CLS note in `SHARED.md`) and once painted (either the live, animating
 * copy or, in the reduced-motion/string branch, the same final text again). Tests that care about
 * what's *actually on screen* need the painted one, not whichever the DOM order happens to put
 * first — this picks it out by the one thing that reliably distinguishes them: the `invisible`
 * class.
 */
function paintedNumeral(container: HTMLElement): Element {
  const candidates = Array.from(container.querySelectorAll('.tabular-nums'));
  const painted = candidates.find((el) => !el.classList.contains('invisible'));
  if (!painted) {
    throw new Error('no painted numeral found');
  }
  return painted;
}

/** True if any element in the tree carries a class containing `substr` — for asserting on the
 *  Tailwind arbitrary-value classes (`text-[clamp(...)]`) that a CSS attribute selector can't
 *  safely match because of the embedded parentheses and commas. */
function hasClassContaining(container: HTMLElement, substr: string): boolean {
  return Array.from(container.querySelectorAll('*')).some((el) => el.className.includes(substr));
}

describe('MegaStat', () => {
  it('renders the label and the final value immediately, before any animation resolves', () => {
    // No `await`, no timer advance: the final value is reserved in an `invisible` span from the
    // very first render, independent of whether the count-up ever gets to run.
    const { container } = render(<MegaStat value={379} label="Points" />);

    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(container.querySelector('.invisible')?.textContent).toBe('379');
  });

  it('renders a string value verbatim and never counts it', () => {
    const { container } = render(<MegaStat value="DNF" label="Status" />);

    const painted = paintedNumeral(container);
    // A string value takes the static-final branch unconditionally — no `aria-hidden`, because
    // nothing about it is ever transiently wrong the way a mid-count number is.
    expect(painted.textContent).toBe('DNF');
    expect(painted).not.toHaveAttribute('aria-hidden');
  });

  it('reduced motion renders the final numeric value immediately, not 0', () => {
    // This is the assertion that matters most (per the task brief): jsdom never runs an animation
    // frame, so a count-up that is broken in the reduced-motion branch would otherwise leave "0"
    // on screen forever, and this is the only test that would catch it.
    reduceMotion = true;
    const { container } = render(<MegaStat value={379} label="Points" />);

    const painted = paintedNumeral(container);
    expect(painted.textContent).toBe('379');
    expect(painted.textContent).not.toBe('0');
    expect(painted).not.toHaveAttribute('aria-hidden');
  });

  it('gives the counting numeral an accessible name that is always the final value', () => {
    // Without reduced motion, the painted numeral is mid-count and `aria-hidden` — the accessible
    // name for the stat comes from `aria-label` on its container instead, and that label is
    // static, so it is correct even while the digits are still animating.
    const { container } = render(<MegaStat value={379} label="Points" />);

    const painted = paintedNumeral(container);
    expect(painted).toHaveAttribute('aria-hidden', 'true');
    expect(painted.closest('[aria-label]')).toHaveAttribute('aria-label', '379');
  });

  it('renders ordinal and sup when provided', () => {
    render(<MegaStat value={1} label="Position" ordinal="ST" sup=".909" />);

    expect(screen.getByText('ST').tagName).toBe('SUP');
    expect(screen.getByText('.909').tagName).toBe('SUP');
  });

  it('renders no sup elements when ordinal and sup are both omitted', () => {
    const { container } = render(<MegaStat value={1} label="Position" />);

    expect(container.querySelectorAll('sup')).toHaveLength(0);
  });

  it('renders a Scribble overlay when scribble is provided', () => {
    const { container } = render(<MegaStat value={1} label="Position" scribble="p1" />);

    // `Scribble` always renders exactly one `svg` for its mark, decorated `aria-hidden` somewhere
    // in its own subtree — but *which* element carries that attribute is Scribble's internal
    // layout, not a contract this test should pin. (It already moved once, from the `svg` itself
    // to a wrapping span, which broke a version of this assertion that queried
    // `svg[aria-hidden="true"]` directly.) Assert on the `svg`'s existence and on it being marked
    // decorative *somewhere* up the tree, not on which tag holds the attribute.
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders no Scribble overlay by default', () => {
    const { container } = render(<MegaStat value={1} label="Position" />);

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('scopes the Scribble overlay to the counted value only, not the ordinal or the label', () => {
    // Regression guard for a coordinator-caught defect: a `p1` scribble across a championship
    // position was found painting over the label row above the numeral instead of the numeral
    // itself. jsdom can't measure where the mark's pixels land, but it can pin the actual cause a
    // pixel check would be standing in for — *which element* `<Scribble>` wraps. If that element
    // ever grows to include the ordinal or the label, this fails even though the geometry bug it
    // guards against is invisible here.
    const { container } = render(
      <MegaStat value={1} label="Championship position" ordinal="ST" scribble="p1" />,
    );

    // Query the `svg` itself, not `svg[aria-hidden="true"]` — Scribble puts `aria-hidden` on a
    // wrapping span around the svg now (it used to sit on the svg directly), so pinning the
    // attribute to the tag is exactly the "reach into Scribble's internals" this test means not
    // to do. There is only ever one `svg` in this tree; which of its ancestors happens to carry
    // `aria-hidden` is Scribble's business, not this test's.
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // `Scribble`'s own wrapper is `relative inline-block` (see scribble.tsx) — the nearest
    // ancestor with exactly that pair of classes is the box `Scribble` actually annotates.
    const scribbleWrapper = svg?.closest('.relative.inline-block');
    expect(scribbleWrapper).not.toBeNull();
    expect(scribbleWrapper).not.toHaveTextContent('ST');
    expect(scribbleWrapper).not.toHaveTextContent('Championship position');
  });

  it('marks the decorative tick bar aria-hidden and pointer-events-none', () => {
    const { container } = render(<MegaStat value={379} label="Points" />);

    const tick = container.querySelector('.bg-f1-red');
    expect(tick).toHaveAttribute('aria-hidden', 'true');
    expect(tick).toHaveClass('pointer-events-none');
  });

  it('gives both the reserved and painted numerals tabular-nums, the CLS guard', () => {
    // A counting numeral with proportional-width figures changes width on every tick as digits
    // change shape; `tabular-nums` holds each digit slot at a fixed width so only the reserved
    // `invisible` copy (not this class) has to do the work of holding the digit *count* steady.
    // Both copies need it because either one can be the on-screen numeral depending on
    // reduced-motion/value-type branch.
    const { container } = render(<MegaStat value={379} label="Points" />);

    const numerals = container.querySelectorAll('.tabular-nums');
    expect(numerals.length).toBeGreaterThanOrEqual(2);
    numerals.forEach((el) => expect(el).toHaveClass('tabular-nums'));
  });

  it('renders the .text-mega scale by default', () => {
    const { container } = render(<MegaStat value={379} label="Points" />);

    expect(container.querySelector('.text-mega')).toBeInTheDocument();
  });

  it('renders the mid clamp scale when scale="mid" is passed', () => {
    const { container } = render(<MegaStat value={379} label="Points" scale="mid" />);

    expect(container.querySelector('.text-mega')).not.toBeInTheDocument();
    expect(hasClassContaining(container, 'clamp(2.5rem,6vw,4.5rem)')).toBe(true);
  });

  it('merges a passed className onto the root element', () => {
    const { container } = render(
      <MegaStat value={379} label="Points" className="my-marker-class" />,
    );

    expect(container.querySelector('.my-marker-class')).toBeInTheDocument();
  });
});
