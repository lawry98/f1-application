import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Scribble, type ScribbleType } from '@/components/candy/scribble';

/**
 * `useReducedMotion()` cannot be driven through `window.matchMedia` here, for two reasons that
 * both live in `motion`'s own code: it caches the preference in a module-global initialised on the
 * first call and never re-reads it, and it queries `(prefers-reduced-motion)` rather than
 * `(prefers-reduced-motion: reduce)`, which the `matchMedia` stub in `tests/setup.ts` would not
 * match anyway. Partial-mocking the module and flipping a flag is the only way to see both
 * branches in one file; the spread keeps every real `motion` element working.
 *
 * It still works now that the component reads `useReducedMotionSafe` rather than motion's hook
 * directly — that hook calls motion's internally, and `vi.mock` replaces the module for every
 * importer in this file's registry, not just for the component under test.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

const TYPES: ScribbleType[] = ['circle', 'underline', 'p1', 'strike'];

/**
 * `element.className` is a plain string on HTML elements and an **`SVGAnimatedString` object** on
 * SVG ones, so `expect(svg.className).toContain(...)` fails with a type error rather than an
 * assertion failure and `toMatch` reports "expected a string, got object". Read the attribute.
 */
const classesOf = (element: Element): string => element.getAttribute('class') ?? '';

/**
 * The positioned overlay — the span holding the insets, not the `<svg>` inside it. The distinction
 * is the whole subject of "lets CSS own both axes" below.
 */
const overlayOf = (container: HTMLElement): Element =>
  container.querySelector('span[aria-hidden="true"]')!;

/**
 * The scale each mark is drawn at when it wraps a `text-2xl` word — the geometric mean of its two
 * axis scales, from boxes measured in Chromium at 1440×900 (e.g. circle: a 134.9×43.5 overlay over a
 * 200×100 viewBox is 0.67 × 0.44 → 0.54). Kept here so `stroke-width` can be checked in the units
 * that matter, which are screen pixels, not viewBox units.
 */
const REFERENCE_SCALE: Record<ScribbleType, number> = {
  circle: 0.54,
  underline: 0.6,
  p1: 0.46,
  strike: 0.41,
};

/** How many pen strokes each mark is drawn with. A hand draws these one at a time. */
const STROKE_COUNT: Record<ScribbleType, number> = {
  circle: 1,
  underline: 2,
  p1: 3,
  strike: 3,
};

describe('Scribble', () => {
  it('renders its children', () => {
    render(<Scribble type="circle">FASTEST LAP</Scribble>);

    expect(screen.getByText('FASTEST LAP')).toBeInTheDocument();
  });

  it.each(['onView', 'immediate'] as const)(
    'keeps its children in the DOM with draw=%s',
    (draw) => {
      // The content must exist from the first render, whatever the animation is doing. A reveal
      // that gates whether text exists turns a stuck animation into data loss; the worst case for
      // a scribble that never draws has to be a missing decoration.
      render(
        <Scribble type="underline" draw={draw}>
          POLE POSITION
        </Scribble>,
      );

      expect(screen.getByText('POLE POSITION')).toBeInTheDocument();
    },
  );

  it.each(TYPES)('draws %s from at least one non-empty path', (type) => {
    const { container } = render(<Scribble type={type} />);
    const paths = Array.from(container.querySelectorAll('path'));

    expect(paths).toHaveLength(STROKE_COUNT[type]);
    for (const path of paths) {
      // A `d` of `''` renders nothing at all and no test that counts elements would notice, so the
      // attribute is checked for actual geometry: a move-to plus at least one curve.
      expect(path.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ C /);
    }
  });

  it.each(TYPES)('gives %s a viewBox matched to its own aspect ratio', (type) => {
    // Each mark is authored at roughly one unit per CSS pixel at the size it annotates, so its
    // viewBox is also its natural aspect ratio. A shared viewBox would mean `p1` and `underline`
    // scaling into the same box, and the whole point is that a `p1` is square-ish and an underline
    // is a 10:1 strip.
    const { container } = render(<Scribble type={type} />);
    const viewBox = container.querySelector('svg')!.getAttribute('viewBox')!;
    const [, , width, height] = viewBox.split(' ').map(Number);

    expect(viewBox).toMatch(/^0 0 \d+ \d+$/);
    expect(width! / height!).toBeGreaterThan(type === 'p1' ? 0.5 : 1.5);
  });

  it.each(TYPES)('scales %s to whatever it annotates', (type) => {
    // This is the deliberate opposite of `TopoBackground`, which carries no viewBox at all so its
    // texture never scales. A scribble is tracking the size of the thing it is drawn over, so it
    // must stretch: `none` everywhere except `p1`, where non-uniform stretch would distort
    // letterforms and read as a broken font rather than as a hand.
    const { container } = render(<Scribble type={type} />);

    expect(container.querySelector('svg')).toHaveAttribute(
      'preserveAspectRatio',
      type === 'p1' ? 'xMidYMid meet' : 'none',
    );
  });

  it.each(TYPES)('never closes the %s strokes into a shape', (type) => {
    // `Z` is the single character that would turn the 1.5-lap circle into an outline and the
    // strike into a triangle. Everything here is an open stroke with two loose ends.
    const { container } = render(<Scribble type={type} />);

    for (const path of Array.from(container.querySelectorAll('path'))) {
      expect(path.getAttribute('d')).not.toMatch(/[Zz]/);
    }
  });

  it('circles about one and a half times rather than once', () => {
    /*
     * The pen has to pass its own start point and keep going; that overshoot is the whole reason
     * the mark reads as circling something by hand rather than as an ellipse.
     *
     * Counting `C` segments would be the easy assertion and it pins nothing — seven segments could
     * be one lap drawn in small pieces. So this measures the actual **angular sweep**: it walks the
     * endpoint of every curve, takes its bearing from the middle of the viewBox, unwraps the
     * deltas, and totals them. One lap is 1.0 turns; this shape is authored at 1.46. The window is
     * deliberately narrow enough that both failure modes are caught — "tidying" the second lap away
     * drops it under 1.3, and a full second lap pushes it over 1.8.
     */
    const { container } = render(<Scribble type="circle" />);
    const svg = container.querySelector('svg')!;
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const centreX = width! / 2;
    const centreY = height! / 2;

    // `M x y`, then six numbers per `C`, of which only the last two are on the curve.
    const d = container.querySelector('path')!.getAttribute('d')!;
    const numbers = (d.match(/-?[\d.]+/g) ?? []).map(Number);
    const bearings = [Math.atan2(numbers[1]! - centreY, numbers[0]! - centreX)];
    for (let i = 2; i + 5 < numbers.length; i += 6) {
      bearings.push(Math.atan2(numbers[i + 5]! - centreY, numbers[i + 4]! - centreX));
    }

    let turns = 0;
    for (let i = 1; i < bearings.length; i++) {
      let delta = bearings[i]! - bearings[i - 1]!;
      // Unwrap: a step is always the short way round, never the 300°+ jump the seam would suggest.
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      turns += delta / (2 * Math.PI);
    }

    expect(Math.abs(turns)).toBeGreaterThan(1.3);
    expect(Math.abs(turns)).toBeLessThan(1.8);
  });

  it('draws multi-stroke marks as separate paths, not one polystroke', () => {
    // One `path` per pen stroke is what makes the stagger possible: a hand does not draw the P's
    // bowl and the 1 at the same instant, and a single path containing several `M` commands
    // animates as one stroke, which is the tell that gives the effect away.
    const { container } = render(<Scribble type="p1" />);
    const paths = Array.from(container.querySelectorAll('path'));

    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.getAttribute('d')!.match(/M/g)).toHaveLength(1);
    }
  });

  it.each(TYPES)('leaves the %s overlay decorative and out of the layout', (type) => {
    const { container } = render(<Scribble type={type}>WORD</Scribble>);
    const overlay = overlayOf(container);

    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.classList.contains('pointer-events-none')).toBe(true);
    // Absolute for both reasons at once: a scribble must not intercept a click on the text it
    // annotates, and it must not take part in layout — adding one can never move the content it
    // marks, so CLS stays 0.
    expect(overlay.classList.contains('absolute')).toBe(true);
    // Both properties cover a subtree, so the svg inside is hidden and click-through by descent
    // rather than by repeating the attributes on it.
    expect(container.querySelector('svg')!.closest('[aria-hidden="true"]')).toBe(overlay);
  });

  it.each(TYPES)('lets CSS own both axes of the %s overlay box', (type) => {
    /*
     * Measured in Chromium at 1440×900 with the insets on the `<svg>` itself, each mark wrapping a
     * `text-2xl` word whose box is 32px tall:
     *
     *   type       word box      rendered        wanted
     *   circle     122.6 × 32    154.6 × 77.3    ~135 × 44   (ran down into the caption below)
     *   underline  136.7 × 32     63.9 × 6.4     ~145 wide   (spanned 47% of the word)
     *   p1         154   × 32    154   × 148.4   ~154 × 49   (3× too tall, overflowed the card)
     *   strike      48.2 × 32     64.2 × 19.2     64.2 × 32
     *
     * One cause for every row: an `<svg>` is a **replaced** element, so with `height: auto` its own
     * viewBox ratio sizes it and `bottom` is dropped as over-constrained. The numbers are exactly
     * the ratio — strike's 200×60 viewBox at width 64.2 gives 19.26, p1's 110×106 at width 154
     * gives 148.4 — and `underline`'s 6.4px is `0.4em` resolving against the wrapper's 16px instead
     * of the child's 24px, with its width then following from the ratio.
     *
     * jsdom lays nothing out, so this asserts the mechanism, not the pixels: the insets are on a
     * non-replaced element, both axes are constrained, and the svg is sized explicitly rather than
     * intrinsically. Any one of those three going missing brings the bug back.
     */
    const { container } = render(<Scribble type={type}>WORD</Scribble>);
    const overlay = overlayOf(container);
    const svg = container.querySelector('svg')!;

    expect(overlay.tagName).toBe('SPAN');
    expect(classesOf(overlay)).toMatch(/(^|\s)-?(inset-x|left|right)-/);
    expect(classesOf(overlay)).toMatch(/(^|\s)-?(inset-y|top|bottom|h)-/);

    // Explicit 100% on both axes. `auto` on either is what hands the decision back to the ratio.
    expect(svg.classList.contains('h-full')).toBe(true);
    expect(svg.classList.contains('w-full')).toBe(true);
    // A width/height *attribute* would fight the CSS box in the same way.
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
    // And the svg must not be the positioned element — moving the insets back onto it is precisely
    // the regression.
    expect(svg.classList.contains('absolute')).toBe(false);
  });

  it.each(TYPES)('keeps the %s overlay proportional to the text it annotates', (type) => {
    // `em` on the overlay resolves against the *overlay's* inherited font size, which is the
    // wrapper's — and the usual call site puts `text-2xl` on a child *inside* the wrapper, so `em`
    // measured 16px against 24px text and the underline came out 6.4px tall. Percentages resolve
    // against the wrapper's own box, which is the annotated text's box. px is fine where the offset
    // is meant to be a fixed few pixels (`-inset-x-1`, `-inset-x-2`), but `em` is never right here.
    const { container } = render(<Scribble type={type}>WORD</Scribble>);

    expect(classesOf(overlayOf(container))).not.toMatch(/em\]/);
  });

  it('positions the overlay against its own wrapper', () => {
    // Without `relative` on the wrapper the absolute overlay resolves its inset against the
    // nearest positioned ancestor — in practice the page section — and every mark lands somewhere
    // else entirely. `inline-block` is the other half: it lets a scribble mark one word mid
    // sentence without breaking the line.
    const { container } = render(<Scribble type="strike">WORD</Scribble>);
    const wrapper = container.firstElementChild!;

    expect(wrapper.classList.contains('relative')).toBe(true);
    expect(wrapper.classList.contains('inline-block')).toBe(true);
    expect(wrapper.querySelector('svg')).not.toBeNull();
  });

  it.each(['circle', 'strike'] as const)('lets %s sit outside the content box', (type) => {
    // A circle drawn round a word encloses it with air, and a strike-through that stops exactly at
    // the last glyph looks measured rather than annoyed. Both need a negative inset — which is
    // free, because a negative inset on an absolutely positioned element does not affect layout.
    // `overflow-visible` is the other half: an SVG clips at its viewBox by default, and half the
    // stroke width sits outside the path's extent.
    const { container } = render(<Scribble type={type}>WORD</Scribble>);

    expect(classesOf(overlayOf(container))).toMatch(/-inset-x-/);
    expect(container.querySelector('svg')!.classList.contains('overflow-visible')).toBe(true);
  });

  it('fills the circle viewBox with ink so its inset means what it says', () => {
    /*
     * The circle is the one mark whose coordinates were remapped onto its own viewBox, and this is
     * what that buys. Padding *inside* a viewBox scales with the box while a CSS inset does not: at
     * the authored padding of 6.6% the ellipse sat ~3px inside a 122px word's left edge and 28px
     * inside a 600px one, cutting the first and last glyph at every size. With the ink filling the
     * viewBox, `-inset-x-[5%]` is the only thing deciding how far past the word it reaches.
     *
     * 4% of tolerance on each edge: enough for the stroke's own half-width, not enough to hide a
     * reintroduced margin.
     */
    const { container } = render(<Scribble type="circle" />);
    const svg = container.querySelector('svg')!;
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const d = svg.querySelector('path')!.getAttribute('d')!;
    const numbers = (d.match(/-?[\d.]+/g) ?? []).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);

    // Endpoints and control points together, so this is a superset of the true ink box — a curve
    // reaching the edge implies a coordinate near it.
    expect(Math.min(...xs)).toBeLessThanOrEqual(width! * 0.04);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(width! * 0.96);
    expect(Math.min(...ys)).toBeLessThanOrEqual(height! * 0.04);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(height! * 0.96);
  });

  it('hangs the underline below the text rather than over it', () => {
    // An underline is the one mark that must not overlap the glyphs, so it is the one mark not
    // pinned to the whole box: it is a band below it, expressed as `bottom` + `height` so that
    // "hangs below the text" is what the classes actually say. Percentages of the word box — 38%
    // tall, 16% below — which for a 136.7×32 box puts the ink from the baseline to 3px under it.
    const { container } = render(<Scribble type="underline">WORD</Scribble>);
    const overlay = overlayOf(container);

    expect(classesOf(overlay)).toContain('-bottom-[16%]');
    expect(classesOf(overlay)).toContain('h-[38%]');
    expect(overlay.classList.contains('inset-0')).toBe(false);
    // Full word width, give or take the 4px overshoot at each end.
    expect(classesOf(overlay)).toContain('-inset-x-1');
  });

  it.each(TYPES)('strokes %s round-capped and unfilled', (type) => {
    const { container } = render(<Scribble type={type} />);
    const svg = container.querySelector('svg')!;

    // Round caps and joins are what stop a scribble reading as a shape — a butt cap ends a stroke
    // on a hard 90° edge, which no felt tip does — and `fill="none"` is what stops the open curves
    // being filled in by the SVG default of black.
    expect(svg).toHaveAttribute('stroke-linecap', 'round');
    expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    expect(svg).toHaveAttribute('fill', 'none');

    // Set once on the root and inherited. If any individual stroke overrode these, the marks would
    // drift apart from each other silently — the assertion above would still pass.
    for (const path of Array.from(container.querySelectorAll('path'))) {
      expect(path.hasAttribute('stroke-linecap')).toBe(false);
      expect(path.hasAttribute('fill')).toBe(false);
    }
  });

  it.each(TYPES)('renders the %s stroke at marker weight, not hairline', (type) => {
    /*
     * `stroke-width` is in viewBox units, and each mark is drawn at a different scale, so the only
     * width that means anything is `width × scale`. This is why the widths are per shape rather than
     * one shared constant: with a shared 2.5 the strike measured 0.8px against the circle's 1.7px —
     * four different weights on screen, all under the brief's 2–3px, reading as a fine technical pen
     * rather than a marker.
     *
     * The scales are measured, not derived, so this cannot compute them from the DOM (jsdom lays
     * nothing out). Duplicating the arithmetic is the point: adding a fifth mark with a plausible
     * looking width is exactly the mistake that would otherwise ship as a hairline.
     */
    const { container } = render(<Scribble type={type} />);
    const width = Number(container.querySelector('svg')!.getAttribute('stroke-width'));
    const onScreen = width * REFERENCE_SCALE[type];

    expect(onScreen).toBeGreaterThanOrEqual(2);
    expect(onScreen).toBeLessThanOrEqual(3);
  });

  it('draws all four marks with the same pen', () => {
    // Two marks side by side in a styleguide cell — or a circle and an underline on the same
    // headline — have to look like one instrument. Absolute widths differ per shape *so that* the
    // rendered weights match, so the invariant to assert is the spread of the rendered weights.
    const rendered = TYPES.map((type) => {
      const { container } = render(<Scribble type={type} />);
      const width = Number(container.querySelector('svg')!.getAttribute('stroke-width'));
      return width * REFERENCE_SCALE[type];
    });

    expect(Math.max(...rendered) - Math.min(...rendered)).toBeLessThanOrEqual(0.5);
  });

  it('colours the mark without colouring the text it annotates', () => {
    const { container } = render(<Scribble type="circle">WORD</Scribble>);
    const wrapper = container.firstElementChild!;
    const svg = container.querySelector('svg')!;

    // `currentColor` against a text colour rather than a hard-coded #E10600, so a call site can
    // recolour the stroke with `[&_svg]:text-ink`.
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg.classList.contains('text-f1-red')).toBe(true);
    // The colour class has to be on the overlay, not the wrapper. On the wrapper it cascades into
    // the children, and a scribbled headline turns red along with its scribble — which no test
    // asserting only on the svg would ever notice.
    expect(classesOf(wrapper)).not.toContain('text-f1-red');
  });

  it('lets a className size a bare mark', () => {
    // A `p1` with no children has nothing to give the wrapper a box, so the call site supplies one
    // and the merge must let `block` beat `inline-block`.
    const { container } = render(<Scribble type="p1" className="block h-24 w-24" />);
    const wrapper = container.firstElementChild!;

    expect(wrapper.classList.contains('inline-block')).toBe(false);
    expect(wrapper.classList.contains('block')).toBe(true);
    expect(wrapper.classList.contains('h-24')).toBe(true);
  });

  it.each(['onView', 'immediate'] as const)('starts the draw-on at zero length (%s)', (draw) => {
    // motion animates `pathLength` by setting the SVG `pathLength` attribute to 1 and expressing
    // the dash pattern as a fraction of it, so `stroke-dasharray="0 1"` in the first paint *is*
    // the undrawn stroke. Asserting it here is what gives the reduced-motion test below its
    // meaning: the two branches are distinguishable in the markup.
    const { container } = render(<Scribble type="underline" draw={draw} />);

    for (const path of Array.from(container.querySelectorAll('path'))) {
      expect(path).toHaveAttribute('pathLength', '1');
      expect(path.getAttribute('stroke-dasharray')).toMatch(/^0[\s,]/);
    }
  });

  it.each(TYPES)('renders %s fully drawn under reduced motion', (type) => {
    reduceMotion = true;
    const { container } = render(<Scribble type={type}>WORD</Scribble>);
    const paths = Array.from(container.querySelectorAll('path'));

    // The static *final* state: every stroke present, with no dash pattern at all. A
    // `motion.path` pinned at `pathLength: 1` would still carry the dasharray/dashoffset pair,
    // which is a way for the mark to end up partially drawn; the absence of those attributes is
    // what proves no draw-on was started rather than merely finished.
    expect(paths).toHaveLength(STROKE_COUNT[type]);
    for (const path of paths) {
      expect(path.getAttribute('d')).toMatch(/^M /);
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      expect(path.hasAttribute('stroke-dashoffset')).toBe(false);
      expect(path.hasAttribute('pathLength')).toBe(false);
    }
    // And the content it annotates is still there and readable — never hidden, never dropped.
    expect(screen.getByText('WORD')).toBeInTheDocument();
  });

  it('ignores delay under reduced motion rather than holding the mark back', () => {
    // `delay` exists so a mark can wait for the reveal bar covering its word to clear. Under
    // reduced motion there is no bar and no draw-on, so a delayed mark must be *fully present at
    // first paint*, not merely started late — a wait implemented as a shared transition would
    // otherwise leave a reduced-motion user looking at nothing for the delay's duration.
    reduceMotion = true;
    const { container } = render(
      <Scribble type="underline" delay={0.9}>
        WORD
      </Scribble>,
    );

    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths).toHaveLength(STROKE_COUNT.underline);
    for (const path of paths) {
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
    }
  });

  it('keeps the overlay decorative under reduced motion too', () => {
    // The reduced-motion branch swaps `motion.path` for a plain `path`, which is exactly the kind
    // of second code path where an `aria-hidden` or a `pointer-events-none` gets dropped.
    reduceMotion = true;
    const { container } = render(<Scribble type="circle">WORD</Scribble>);
    const overlay = overlayOf(container);

    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.classList.contains('pointer-events-none')).toBe(true);
    expect(overlay.classList.contains('absolute')).toBe(true);
    expect(container.querySelector('svg')!.classList.contains('h-full')).toBe(true);
  });
});
