import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeardownScene } from '@/components/teardown/teardown-scene';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { detach, restingTextNeutrals } from './zinc';

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

/**
 * The four corner-marker roots. Matched on the two layout classes only this component's markers
 * carry (`items-start` + `gap-2`) rather than on the text inside them, because the assertions below
 * are about the marker's own `style` attribute, and the copy sits three elements deeper.
 */
function calloutRoots(container: HTMLElement): HTMLElement[] {
  const roots = Array.from(container.querySelectorAll<HTMLElement>('.items-start.gap-2'));
  expect(roots).toHaveLength(4);
  return roots;
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

  it('renders all four corner-marker callouts, numbered in order', () => {
    render(<TeardownScene />);

    // The original callout's copy is unchanged and must survive every restyle of its container —
    // this is the assertion that proves it was re-set rather than quietly dropped.
    expect(screen.getByText('V6 Turbo Hybrid Power Unit')).toBeInTheDocument();
    expect(
      screen.getByText('1.6L V6 turbo-hybrid — over 1000 HP combined output'),
    ).toBeInTheDocument();

    expect(screen.getByText('Front wing')).toBeInTheDocument();
    expect(screen.getByText('Halo')).toBeInTheDocument();
    expect(screen.getByText('Rear wing')).toBeInTheDocument();

    // The numerals come from the array index, so they silently renumber if LABELS is reordered.
    // Pinning them here means a reorder has to be deliberate: the sequence is front-to-back along
    // the car and the scroll windows are staggered to match, so 03 must stay the power unit.
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
  });

  it('runs the rear two markers leftward so they cannot overflow the viewport', () => {
    const { container } = render(<TeardownScene />);

    // A marker is ~223px wide at desktop and ~173px at 390, where the car box is only 359px across.
    // Anchored past roughly 70% of the car's width, a right-running marker pushes a horizontal
    // scrollbar onto the whole page — which is a defect that actually shipped once, at 390, with a
    // single marker. The mirrored variant is what makes four callouts possible at all, so the two
    // rear ones must carry it. jsdom cannot measure the overflow, but it can hold the class
    // contract that prevents it.
    const mirrored = container.querySelectorAll('.flex-row-reverse');
    expect(mirrored).toHaveLength(2);
  });

  it('scrims the callout copy but leaves the dot and the leader bare', () => {
    const { container } = render(<TeardownScene />);

    // The copy sits on a rendered car frame, not on the page background its colours were picked
    // against: decoding the shipped PNGs and compositing over #09090B puts 35.4% of callout 02's
    // text box under 4.5:1, with a brightest pixel of rgb(249,245,242) where `ink` reads 1.02:1.
    // The scrim is what fixes that, and it belongs to the text block alone — a scrim on the marker
    // itself would put a card back over the drawing, which is the treatment this replaced. jsdom
    // can measure none of that, but the class contract that carries it is exactly this.
    for (const root of calloutRoots(container)) {
      const [dot, leader, copy] = Array.from(root.children);

      expect(copy).toHaveClass('bg-zinc-950/85', 'backdrop-blur-sm');
      // The 130px clamp is what keeps a marker inside the viewport at 390. `px-2` is free because
      // preflight makes the box border-box, but a `max-w` or a dropped clamp would not be.
      expect(copy).toHaveClass('w-[130px]', 'sm:w-[180px]');

      expect(dot).not.toHaveClass('bg-zinc-950/85');
      expect(leader).not.toHaveClass('bg-zinc-950/85');
    }
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
    expect(screen.getByText('Front wing')).toBeInTheDocument();
    expect(container.querySelector('#teardown-outro')).not.toBeNull();
  });

  it('lands the callouts without travel or a transition under reduced motion', () => {
    reduceMotion = true;
    const { container } = render(<TeardownScene />);

    for (const root of calloutRoots(container)) {
      // The fade and the 10px lift are the animation, and reduced motion asks for neither.
      expect(root.style.transition).toBe('');
      expect(root.style.transform).not.toContain('translateY');
      // `translateX(-100%)` is not motion: it is what holds a mirrored marker's dot on its anchor,
      // and dropping it under reduced motion would move every rear callout by its own width.
      // Two of the four are mirrored, so the class and the transform have to agree here.
      const expected = root.classList.contains('flex-row-reverse') ? 'translateX(-100%)' : null;
      if (expected) expect(root.style.transform).toBe(expected);
    }
  });

  it('animates the callouts in when motion is allowed', () => {
    const { container } = render(<TeardownScene />);

    // The negative half of the test above: without it, a reduced-motion branch that had quietly
    // become unconditional would still pass, since "no transition anywhere" satisfies it.
    for (const root of calloutRoots(container)) {
      expect(root.style.transition).toContain('opacity 0.45s ease');
      expect(root.style.transform).toContain('translateY');
    }
  });

  it('holds every resting neutral above the small-text floor, bar three pre-existing runs', () => {
    /*
     * The contrast assertion this file shipped without — and it sits next to `teardown-outro.tsx`,
     * where a `zinc-500` regression was found precisely because every contrast claim on this
     * branch lived in prose until these tests started measuring the ratio. Same shape as
     * `tests/teardown-outro.test.tsx` and `tests/credits-page.test.tsx`. `DARK_BG` (#09090b) is
     * the real background: `/teardown` paints `bg-zinc-950`, the same hex, and nothing in this
     * component's own tree puts a translucent surface behind a neutral.
     *
     * **Three regions are excluded, and none of them is this branch's to fix.** All three are
     * `text-zinc-500` (#71717a) at 12px — small text, so held to 4.5:1 — and all three measure
     * **4.12:1**, under the floor. They are pre-existing on `main`, out of scope for this pass,
     * and deliberately left at the colour they have:
     *
     *   1. the frame-count / loading overlay, whose kicker is `zinc-500` at 4.12:1 (and which also
     *      carries a `zinc-700` "/192" denominator at 1.91:1 and a `zinc-600` "Preparing teardown
     *      sequence…" line at 2.57:1 — it is excluded whole, so all three go with it);
     *   2. the header's "Back" link;
     *   3. the "Scroll to begin" hint.
     *
     * The count is pinned and the skipped runs are pinned by text, so the hole cannot silently
     * widen: adding a fourth dim run, or letting one of these regions grow another, fails here
     * rather than passing quietly. Fixing any of them is a matter of deleting its line from the
     * expected list and watching the main assertion cover it.
     */
    const { container } = render(<TeardownScene />);

    // `aria-hidden` decoration first, by the property that justifies skipping it rather than by
    // shade — the same technique `landing-how-it-works.test.tsx` uses. The header's `←` and its
    // `|` divider inherit `zinc-500`/`zinc-700` from their wrappers, are out of the accessibility
    // tree, and duplicate an accessible label that is measured below. The day one becomes real
    // content it stops being excluded and this test fails.
    Array.from(container.querySelectorAll('[aria-hidden="true"]')).forEach((el) => el.remove());

    const loadingOverlay = container.querySelector<HTMLElement>('.fixed.inset-0.z-50');
    const backLink = container.querySelector<HTMLElement>('header a[href="/"]');
    const excluded = [loadingOverlay, backLink, screen.getByText('Scroll to begin')].filter(
      (el): el is HTMLElement => el !== null,
    );
    expect(excluded).toHaveLength(3);

    expect(restingTextNeutrals(detach(excluded)).map(({ hex, text }) => `${hex} ${text}`)).toEqual([
      '#71717a Loading frames',
      '#3f3f46 / 192',
      '#52525b Preparing teardown sequence…',
      '#71717a Back',
      '#71717a Scroll to begin',
    ]);

    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
