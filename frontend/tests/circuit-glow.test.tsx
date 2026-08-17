import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitGlow, type CircuitCorner } from '@/components/candy/circuit-glow';
import type { Point } from '@/lib/svg-path';

/**
 * `useReducedMotion` cannot be driven through `window.matchMedia` here. motion caches the
 * preference in a module-global initialised on the first call and never re-read, and it queries
 * `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)` — so a matchMedia
 * stub can neither change mid-file nor match at all. Partial-mocking the module and flipping a
 * flag is the only thing that works; the real `motion` elements still render through `actual`.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** A hand-made lap: four corners of a rounded square, dense enough to be a closed loop. */
const SQUARE: Point[] = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

const CORNERS: CircuitCorner[] = [
  { n: 1, x: 0.8, y: 0.2 },
  { n: 2, x: 0.2, y: 0.8 },
];

const paths = (container: HTMLElement) => Array.from(container.querySelectorAll('path'));

/**
 * The on-curve anchors of a path — the initial `M` and the last coordinate pair of each `C`.
 *
 * Parsing *every* number in `d` measures the control cage instead, and Catmull-Rom's control
 * points deliberately sit outside the hull of the points: that overshoot is what rounds a corner.
 * On a sparse test shape it is large (a four-point square overshoots by ~67 units), so an
 * assertion over all numbers reports a containment failure that the real, densely sampled input
 * does not have.
 */
function anchors(d: string): number[] {
  const move = d.match(/^M (-?[\d.]+) (-?[\d.]+)/)!;
  const found = [Number(move[1]), Number(move[2])];

  for (const segment of d.match(/C [^CZ]+/g) ?? []) {
    const numbers = (segment.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // `C c1x c1y, c2x c2y, x y` — the endpoint is the pair at the end.
    found.push(numbers[4]!, numbers[5]!);
  }

  return found;
}

describe('CircuitGlow', () => {
  it('draws the glow variant as three layers of one path', () => {
    /*
     * The three strokes must share a single `d`. The glow is one line painted three times —
     * a blurred 14-unit halo, a 5-unit body, a 1.5-unit specular core — so any divergence in
     * the geometry shows up as a doubled track rather than as a lit one.
     */
    const { container } = render(<CircuitGlow points={SQUARE} />);
    const layers = paths(container);

    expect(layers).toHaveLength(3);
    const ds = layers.map((path) => path.getAttribute('d'));
    expect(new Set(ds).size).toBe(1);

    // Closed, because a lap is a loop; an open path leaves a notch at start/finish.
    expect(ds[0]).toMatch(/Z$/);
    // Smoothed with cubic beziers, not a polyline: these points are samples off a real curve,
    // so `catmullRomPath` interpolates between them. `L` here would mean the wrong helper.
    expect(ds[0]).toContain(' C ');
  });

  it('keeps the spec 14 / 5 / 1.5 stroke ratio inside the viewBox space', () => {
    /*
     * This is the trap in this component. Points arrive normalised 0–1, where a stroke width of
     * 14 is fourteen times the whole picture — so the widths only mean anything relative to the
     * user space the viewBox declares. Assert both together: the ratio and the space it lives
     * in. Changing the viewBox without rescaling the strokes, or vice versa, fails here.
     */
    const { container } = render(<CircuitGlow points={SQUARE} />);
    const svg = container.querySelector('svg')!;
    const widths = paths(container).map((path) => Number(path.getAttribute('stroke-width')));

    expect(svg).toHaveAttribute('viewBox', '0 0 500 500');
    expect(widths).toEqual([14, 5, 1.5]);
  });

  it('insets the points so the halo is not cut off square at the viewBox edge', () => {
    /*
     * The point at 0,0 has to land far enough inside 0–500 for the widest stroke and its blur to
     * fit: half of 14 (7) plus 3σ of a 10-unit Gaussian (30) is 37 units of paint outside the
     * outermost point, and a corner marker needs 46. PAD is 48, so a lap spanning the full 0–1
     * input range lands within [48, 452]. If someone drops PAD to make the map fill more of the
     * box, the halo clips flat against the viewport edge, which reads as a rendering bug — and
     * the corner numbers get sliced.
     */
    const { container } = render(
      <CircuitGlow
        points={[
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]}
      />,
    );
    const coordinates = anchors(paths(container)[0]!.getAttribute('d')!);

    expect(Math.min(...coordinates)).toBe(48);
    expect(Math.max(...coordinates)).toBe(452);
  });

  it('gives each instance its own blur filter id', () => {
    /*
     * The collision guard. SVG ids are document-global, so a hard-coded filter id would leave
     * every instance on the page resolving to the *first* one's definition — which looks fine
     * until a second circuit appears. `useId` is what prevents it, and the assertion that
     * matters is not merely that the two ids differ but that each path references the filter
     * defined inside its own svg.
     */
    const { container } = render(
      <>
        <CircuitGlow points={SQUARE} />
        <CircuitGlow points={SQUARE} />
      </>,
    );
    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs).toHaveLength(2);

    const referenced = svgs.map((svg) => {
      const filterId = svg.querySelector('filter')!.getAttribute('id')!;
      const used = svg.querySelector('path[filter]')!.getAttribute('filter');
      expect(used).toBe(`url(#${filterId})`);
      return filterId;
    });

    expect(referenced[0]).not.toBe(referenced[1]);
  });

  it('blurs the halo layer and only the halo layer', () => {
    const { container } = render(<CircuitGlow points={SQUARE} />);
    const blurred = paths(container).filter((path) => path.hasAttribute('filter'));

    expect(blurred).toHaveLength(1);
    expect(blurred[0]).toHaveAttribute('stroke-width', '14');
    expect(container.querySelector('feGaussianBlur')).toHaveAttribute('stdDeviation', '10');
    // A user-space region, not the default objectBoundingBox percentages: a percentage margin is
    // a fraction of the path's own box, so a tall narrow circuit (Monaco) gets a narrow margin
    // and the halo clips on its short side while there is room to spare on the long one.
    expect(container.querySelector('filter')).toHaveAttribute('filterUnits', 'userSpaceOnUse');
  });

  it('fills nothing, so a closed lap is not painted as a silhouette', () => {
    // Every path is closed, so without `fill="none"` the browser fills the lap with the default
    // black and the track map becomes a blob. jsdom cannot show that, hence the assertion.
    const { container } = render(<CircuitGlow points={SQUARE} />);

    expect(container.querySelector('g')).toHaveAttribute('fill', 'none');
  });

  it('strokes the plain variant grey, with no glow and no red', () => {
    /*
     * The plain variant is the ~120px outline inside a ticket card. The colour arrives as
     * `currentColor` off a text class — the `TopoBackground` idiom — so "no red stroke" is
     * asserted as the absence of the red text class, which is where the red really lives.
     */
    const { container } = render(<CircuitGlow points={SQUARE} variant="plain" />);
    const svg = container.querySelector('svg')!;

    expect(paths(container)).toHaveLength(1);
    expect(container.querySelector('filter')).toBeNull();
    expect(container.querySelector('feGaussianBlur')).toBeNull();
    expect(svg.classList.contains('text-f1-red')).toBe(false);
    expect(svg.classList.contains('text-zinc-500')).toBe(true);
    expect(container.innerHTML).not.toContain('#E10600');
  });

  it('keeps the plain stroke thick enough to survive ticket-card scale', () => {
    // At 120px wide the viewBox scale is 120 / 500 = 0.24, so a 5-unit stroke lands at 1.2
    // device pixels and a 2-unit one at 0.48 — it antialiases away. 6 units is ~1.4px there.
    const { container } = render(<CircuitGlow points={SQUARE} variant="plain" />);

    expect(Number(paths(container)[0]!.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(6);
  });

  it('renders a dot, a leader and a number for every corner', () => {
    const { container } = render(<CircuitGlow points={SQUARE} corners={CORNERS} />);

    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('text')).map((t) => t.textContent)).toEqual([
      '1',
      '2',
    ]);
  });

  it('points every leader away from the shape, never back across the track', () => {
    /*
     * A leader aimed inward runs over the circuit it is labelling — on an oval it crosses the far
     * side as well. The rule is that the leader leaves along the vector from the shape's centroid
     * to the corner, so its far end must be strictly further from the centroid than the dot is.
     * That is checkable arithmetic on the attributes we write, unlike anything about layout.
     */
    const { container } = render(<CircuitGlow points={SQUARE} corners={CORNERS} />);
    // Centroid of SQUARE is (0.5, 0.5), i.e. 250,250 once scaled into the 500-unit space.
    const centre = 250;

    for (const leader of Array.from(container.querySelectorAll('line'))) {
      const at = (name: string) => Number(leader.getAttribute(name));
      const dotReach = Math.hypot(at('x1') - centre, at('y1') - centre);
      const endReach = Math.hypot(at('x2') - centre, at('y2') - centre);

      expect(endReach).toBeGreaterThan(dotReach);
    }
  });

  it('renders no markers when corners are omitted', () => {
    const { container } = render(<CircuitGlow points={SQUARE} />);

    expect(container.querySelector('circle')).toBeNull();
    expect(container.querySelector('line')).toBeNull();
    expect(container.querySelector('text')).toBeNull();
  });

  it('keeps corner numbers grey rather than red', () => {
    // ~10px text. f1-red on the dark base is 4.01:1 — it clears WCAG's 3:1 large-text bar and
    // fails the 4.5:1 that applies at this size, so red numbers would be a contrast failure.
    const { container } = render(<CircuitGlow points={SQUARE} corners={CORNERS} />);

    for (const label of Array.from(container.querySelectorAll('text'))) {
      expect(label.classList.contains('fill-zinc-500')).toBe(true);
      expect(label.classList.contains('font-mono')).toBe(true);
    }
  });

  it('renders no path at all for fewer than two points', () => {
    /*
     * `catmullRomPath` returns `''` below two points, and `<path d="">` is drawn as a dot at the
     * origin by some renderers — so the path element must be absent, not empty. The svg shell
     * stays: the parent sizes this box, so collapsing it on bad data would shift the page.
     */
    const { container } = render(<CircuitGlow points={[[0.5, 0.5]]} />);

    expect(container.querySelector('path')).toBeNull();
    expect(container.querySelector('filter')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 500 500');
  });

  it('is decorative and cannot be distorted by its container', () => {
    /*
     * `meet` is the load-bearing half of this: it fits the whole 500×500 user space inside the
     * container and centres the slack, so a non-square container letterboxes the lap instead of
     * stretching it. `preserveAspectRatio="none"` — the thing a tidy-up might reach for — would
     * squash Monaco into a square.
     */
    const { container } = render(<CircuitGlow points={SQUARE} />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(svg.classList.contains('pointer-events-none')).toBe(true);
  });

  it('lets a className override the default tint', () => {
    // Merged last, so a call site can retint the whole map without a colour prop. `cn` has to
    // drop the default rather than append to it.
    const { container } = render(<CircuitGlow points={SQUARE} className="text-zinc-600" />);
    const svg = container.querySelector('svg')!;

    expect(svg.classList.contains('text-zinc-600')).toBe(true);
    expect(svg.classList.contains('text-f1-red')).toBe(false);
  });

  it.each(['onView', 'immediate'] as const)('draws %s mode on from zero length', (mode) => {
    /*
     * The pair to the reduced-motion test below, and what stops it being vacuous: both modes must
     * *start* dashed to nothing so there is a draw-on to see at all. This reads motion's
     * synchronous first render — `pathLength: 0` becomes `pathLength="1"` plus a `0`-length dash
     * on the element — not a mid-animation value, which under jsdom would not be stable.
     *
     * All three layers, deliberately: the halo has to grow with the line. Animating only the
     * visible strokes would light the whole lap up before the line arrives to justify it.
     */
    const { container } = render(<CircuitGlow points={SQUARE} draw={mode} />);
    const layers = paths(container);

    expect(layers).toHaveLength(3);
    for (const path of layers) {
      // `pathLength="1"` normalises the dash to the 0–1 range, so the first number of the
      // dasharray is the drawn fraction. Asserting that it is zero rather than matching the whole
      // string keeps this off motion's exact formatting (it writes `0 1` today).
      expect(path).toHaveAttribute('pathLength', '1');
      const drawn = path.getAttribute('stroke-dasharray')!.split(/[\s,]+/)[0];
      expect(Number(drawn)).toBe(0);
    }
  });

  it('renders the fully drawn circuit under reduced motion', () => {
    /*
     * The static final state, immediately: all three layers present, in their full widths, with
     * no draw-on. The end state of a `pathLength` animation is a path with no dash at all, so
     * the assertion is that motion has written no `stroke-dasharray` — a reduced-motion branch
     * that left the dash in place at 0 would render an invisible circuit, which is the failure
     * mode the rule exists to prevent.
     */
    reduceMotion = true;
    const { container } = render(<CircuitGlow points={SQUARE} corners={CORNERS} />);
    const layers = paths(container);

    expect(layers).toHaveLength(3);
    for (const path of layers) {
      expect(path.getAttribute('d')).toMatch(/Z$/);
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      expect(path.style.strokeDasharray).toBe('');
    }
    // The glow survives too — reduced motion drops the animation, not the treatment.
    expect(container.querySelector('feGaussianBlur')).not.toBeNull();
    expect(container.querySelectorAll('text')).toHaveLength(2);
  });
});
