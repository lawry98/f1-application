import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MegaStat } from '@/components/candy/mega-stat';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

// `useReducedMotion` caches its answer in a module-global on first call and reads
// `(prefers-reduced-motion)`, not the `: reduce` variant `tests/setup.ts` stubs `matchMedia` with
// — so it cannot be driven through `matchMedia` at all. Partial-mocking the module and flipping
// this flag is the only way this repo has found to control it per-test. It still works now that
// the component reads `useReducedMotionSafe`, because that hook calls motion's hook internally and
// `vi.mock` replaces the module for every importer in this file's registry.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * `MegaStat` renders the numeral twice: once `invisible` (reserving the final value's width from
 * the first frame, so the box never grows as digits are added — the CLS guard) and once painted
 * (either the live, animating copy or, in the reduced-motion/string branch, the same final text
 * again). Tests that care about what is *actually on screen* need the painted one, not whichever
 * the DOM order happens to put first — this picks it out by the one thing that reliably
 * distinguishes them: the `invisible` class.
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
    // Without reduced motion, both numerals are `aria-hidden` — the width-reserving twin because
    // it is invisible, the painted one because it is mid-count — so the name has to come from the
    // container. It is asserted through `getByRole`, i.e. through the **computed accessible
    // name**, not through the presence of an `aria-label` attribute.
    //
    // That distinction is the whole point of this test, and asserting the attribute is what let
    // the defect ship: the label used to sit on a bare `<span>`, whose implicit role is `generic`,
    // and ARIA 1.2 prohibits `aria-label` on `generic` — both Chromium and Gecko drop it, axe
    // reports `aria-prohibited-attr`, and the stat announces with no number at all. An
    // attribute-presence check passes happily through all of that. Same shape of defect as
    // asserting a params dict instead of the serialised URL.
    render(<MegaStat value={379} label="Points" />);

    expect(screen.getByRole('img', { name: '379' })).toBeInTheDocument();
  });

  it('keeps the unit readable beside the named numeral rather than swallowing it', () => {
    // `role="img"` makes its subtree presentational, so its scope is load-bearing: on the numeral
    // *row* it would take the `sup` with it and `/teardown`'s "1000 HP" would announce as "1000".
    // Scoped to the counting box, the image is the numeral and the unit stays real text.
    render(<MegaStat value={1000} label="Power unit output" sup="HP" />);

    const numeral = screen.getByRole('img', { name: '1000' });
    expect(numeral).not.toHaveTextContent('HP');
    expect(screen.getByText('HP').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('exposes no img role once the value is static, because the text itself is readable', () => {
    // Reduced motion and string values paint the true final text with no `aria-hidden` on it, so
    // an authored name would be a second source of truth for something already in the tree.
    reduceMotion = true;
    const { container } = render(<MegaStat value={379} label="Points" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // `paintedNumeral`, not `getByText('379')`: the invisible twin carries the same text, so a
    // text query matches two nodes and throws.
    expect(paintedNumeral(container)).not.toHaveAttribute('aria-hidden');
    expect(paintedNumeral(container).textContent).toBe('379');
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

  /*
   * Phase 7 made `Scribble` **always mounted**, so "no overlay" can no longer mean "no `svg`".
   *
   * The element has to stay in the tree because its presence is what keeps the tree *shape*
   * constant: when it was `scribble ? <Scribble>{box}</Scribble> : box`, a call site that toggles
   * the mark (`/teams` gives it to the championship leader alone) changed the element type above
   * the counting box on every swap, so React rebuilt the box and the numeral dropped back to its
   * literal `0`. That was the whole bug.
   *
   * So what must hold now is that the mark is *withheld*, and the withholding is `display: none`
   * rather than transparency — an invisible-but-laid-out svg still intersects the viewport, and
   * `Scribble`'s `whileInView` is `once`, so it would burn its single draw while hidden and a stat
   * that later became the leader would show an already-finished mark.
   *
   * jsdom computes no Tailwind, so `toBeVisible()` cannot see any of that; the class is the only
   * honest thing to assert here, and it is exactly the token whose removal reinstates the bug.
   */
  it('withholds the Scribble mark by default while keeping its element mounted', () => {
    const { container } = render(<MegaStat value={1} label="Position" />);

    const svg = container.querySelector('svg');
    expect(svg, 'the element stays mounted so the tree shape never changes').toBeInTheDocument();

    expect(
      container.querySelector('.\\[\\&_svg\\]\\:hidden'),
      'the mark must be withheld with display:none, not merely made transparent',
    ).not.toBeNull();
  });

  it('paints the Scribble mark when one is asked for', () => {
    // The other half of the pair above: withholding must be conditional, not permanent.
    const { container } = render(<MegaStat value={1} label="Position" scribble="p1" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('.\\[\\&_svg\\]\\:hidden')).toBeNull();
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

    // Only the count carries information: asserting `toHaveClass('tabular-nums')` on the results
    // of a `.tabular-nums` selector is a tautology the selector already guarantees.
    expect(container.querySelectorAll('.tabular-nums').length).toBeGreaterThanOrEqual(2);
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

  it('holds the label above the 4.5:1 small-text contrast floor, as a ratio not a class name', () => {
    // The label is 11px — small text — so it is held to 4.5:1, not the 3:1 large-text bar.
    // `zinc-500` measures 4.12:1 on bare `base` and fails; `zinc-400` measures 7.76:1. Measuring
    // the *ratio* through `contrastRatio` is what makes swapping the shade fail on the number,
    // which a `toHaveClass('text-zinc-400')` string match would not.
    //
    // `MegaStat` paints no background of its own, and the two shipped call sites do **not** give
    // it the same one. `/teardown`'s outro seats its four stats in bare grid cells on the section's
    // `bg-zinc-950` — the same hex as `DARK_BG` (#09090b) — but `/candy` renders its three inside a
    // cell styled `bg-white/[0.02]`. A translucent white wash lightens the backdrop, which *lowers*
    // a light neutral's ratio: `zinc-400` is 7.52:1 on the `/candy` cell against 7.76:1 on bare
    // base, so the card is the stricter of the two and the one to re-measure against first if this
    // shade is ever lowered. Both clear 4.5:1 with room to spare today, which is why this measures
    // against `DARK_BG`; the margin, not the pass, is what those two numbers record. Measuring the
    // right colour against the wrong background is the mistake `CLAUDE.md` records shipping twice,
    // so a call site putting a heavier layer behind this has to re-measure and pass its own
    // `tone.label`.
    const { container } = render(<MegaStat value={379} label="Points" />);

    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('renders its pre-existing defaults when none of the new props are passed', () => {
    // The backward-compatibility guard for `tone`, `scribbleClassName` and the widened `ordinal`.
    // Every call site of this component predates all three and none of them can be edited from
    // here, so the no-new-props render has to be byte-identical to what it was. This pins each
    // default the new props override, in one place.
    const { container } = render(
      <MegaStat value={379} label="Points" ordinal="ST" scribble="p1" />,
    );

    expect(container.querySelector('.bg-f1-red')).toBeInTheDocument(); // tick
    expect(container.querySelector('.text-ink')).toBeInTheDocument(); // numeral
    expect(container.querySelector('.text-zinc-400')).toBeInTheDocument(); // label
    expect(screen.getByText('ST').tagName).toBe('SUP'); // string ordinal
    // Scribble keeps its own default red when nothing is forwarded to it.
    expect(container.querySelector('svg')!.classList.contains('text-f1-red')).toBe(true);
  });

  it('lets tone replace the numeral, tick and label colours', () => {
    // Phase 5 renders a right-rail stat over a per-team gradient and needs all three: `className`
    // only reaches the outer div, and every colour here is on a descendant.
    const { container } = render(
      <MegaStat
        value={379}
        label="Points"
        tone={{ numeral: 'text-white', tick: 'bg-black', label: 'text-zinc-300' }}
      />,
    );

    expect(container.querySelector('.text-white')).toBeInTheDocument();
    expect(container.querySelector('.bg-black')).toBeInTheDocument();
    expect(container.querySelector('.text-zinc-300')).toBeInTheDocument();
    // Replaced, not merely accompanied — twMerge has to drop each default rather than emit both.
    expect(container.querySelector('.text-ink')).toBeNull();
    expect(container.querySelector('.bg-f1-red')).toBeNull();
    expect(container.querySelector('.text-zinc-400')).toBeNull();
  });

  it('keeps the display size when tone.numeral recolours the numeral', () => {
    // The documented twMerge trap, now with a caller-supplied colour in it: `cn` groups a bare
    // unrecognised `text-<word>` into the same conflict class as a text colour, so
    // `twMerge('text-mega text-ink')` returns `text-ink` alone. That is why the size and the colour
    // sit on two nested spans, and why `tone.numeral` must merge into the *colour* one. Routing it
    // through the size's `cn()` would silently drop `.text-mega` and no other test would notice.
    const { container } = render(
      <MegaStat value={379} label="Points" tone={{ numeral: 'text-white' }} />,
    );

    expect(container.querySelector('.text-mega')).toBeInTheDocument();
    expect(container.querySelector('.text-white')).toBeInTheDocument();
    expect(container.querySelector('.text-ink')).toBeNull();
  });

  it('forwards scribbleClassName to the internal Scribble', () => {
    // `Scribble`'s only recolour hatch is `[&_svg]:text-…` on its own `className` (a bare text
    // colour on its wrapper would cascade into the annotated children), and the element is
    // `MegaStat`'s internal — so without this prop a `p1` over a Ferrari/Sauber/Alpine panel is a
    // red mark on red with nothing able to reach it.
    const { container } = render(
      <MegaStat value={1} label="Position" scribble="p1" scribbleClassName="[&_svg]:text-ink" />,
    );

    const wrapper = container.querySelector('svg')!.closest('.relative.inline-block');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains('[&_svg]:text-ink')).toBe(true);
  });

  it('renders an element ordinal verbatim instead of wrapping it in a sup', () => {
    // Phase 5's ordinal is a chip, and `align-super text-[0.35em]` would shrink a chip to a third
    // of a line and hang it off the baseline — i.e. un-chip it, making the widened type useless.
    // A *string* ordinal still gets the `<sup>`, which the default-props test above pins.
    const { container } = render(
      <MegaStat
        value={1}
        label="Championship position"
        ordinal={<span className="chip">ST</span>}
      />,
    );

    expect(container.querySelectorAll('sup')).toHaveLength(0);
    expect(screen.getByText('ST')).toHaveClass('chip');
  });
});
