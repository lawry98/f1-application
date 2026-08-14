/**
 * Tests for toolLabel() and the tool trace that renders it.
 *
 * The subject is the name-to-prose mapping, the trace's *accessible* signalling, and its
 * contrast — not its styling. The raw name staying visible is a contract, not decoration: the
 * trace is the debugging surface for a run.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolTrace } from '@/components/briefing/tool-trace';
import { toolLabel } from '@/lib/constants';
import { blendOver, contrastRatio, DARK_BG } from '@/lib/team-utils';
import type { ToolResult } from '@/types';
import { restingTextNeutrals, ZINC } from './zinc';

/**
 * `useReducedMotion()` cannot be driven through `window.matchMedia` — `motion` caches the
 * preference in a module-global set on its *first* call and never re-reads it, and it queries
 * `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)`, which the
 * `matchMedia` stub in `tests/setup.ts` would not match anyway. Partial-mocking the module and
 * flipping a flag is the only way to see both branches in one file. `ToolTrace` itself reads no
 * motion hook; the flag reaches it through `LaurelFlourish`, which is the point — the assertion
 * below is about the *trace's* output under the preference, not about the flourish.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * The fixture every row-count assertion is derived from, so the count is stated once. A test that
 * hardcodes "2" in both the fixture and the expectation cannot fail when a row goes missing.
 */
const TOOLS: ToolResult[] = [
  { tool: 'get_track_info', success: true },
  { tool: 'search_f1_news', success: false },
];

/** Reveal the collapsed trace body. */
function expand(): void {
  fireEvent.click(screen.getByRole('button'));
}

/**
 * Every `<path>` in the tree, which under this component is a laurel branch and nothing else: the
 * checkered flag is built entirely from `<rect>`, so a path count is an unambiguous laurel probe
 * that does not reach into `LaurelFlourish`'s internals to find one.
 */
const laurelPaths = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('path'));

/*
 * The three backdrops the trace's text actually sits on, composited in the order the browser
 * paints them.
 *
 * `/briefing` paints `bg-zinc-950` (=== `DARK_BG`) under `<TopoBackground className="text-zinc-300" />`
 * at the texture's built-in 0.12, so **the page backdrop is not `#09090b`** — judging this panel
 * against the raw page colour reports every run optimistically, which is the exact wrong-background
 * failure `CLAUDE.md` records shipping twice on `/teams`. The panel then adds a 3% white wash and
 * each row a further 2%, and white-over-dark makes the surface *lighter* at every step, so the row
 * backdrop is the worst case for every run in the expanded panel — header runs included, which sit
 * one layer up and therefore score better than what is asserted here.
 */
const PAGE_BACKDROP = blendOver(ZINC['300']!, 0.12, DARK_BG);
const PANEL_BACKDROP = blendOver('#ffffff', 0.03, PAGE_BACKDROP);
const ROW_BACKDROP = blendOver('#ffffff', 0.02, PANEL_BACKDROP);

/** WCAG AA for body-sized text. Everything the trace renders is under 19px. */
const MIN_CONTRAST = 4.5;

describe('toolLabel', () => {
  it('maps every backend tool to prose', () => {
    expect(toolLabel('get_track_info')).toBe('Track profile');
    expect(toolLabel('get_recent_race_results')).toBe('Recent race results');
    expect(toolLabel('get_driver_form')).toBe('Driver form');
    expect(toolLabel('get_recent_top_finishers')).toBe('Top finishers');
    expect(toolLabel('get_circuit_winners')).toBe('Circuit winners');
    expect(toolLabel('get_race_weather')).toBe('Weather forecast');
    expect(toolLabel('search_f1_news')).toBe('News search');
  });

  it('degrades an unmapped name to something readable rather than blank', () => {
    // A tool added to the backend before the map is updated must still render.
    expect(toolLabel('get_tyre_compounds')).toBe('get tyre compounds');
  });
});

describe('ToolTrace', () => {
  it('renders nothing at all when no tools ran', () => {
    const { container } = render(<ToolTrace tools={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('labels each tool with its display name', () => {
    render(<ToolTrace tools={[{ tool: 'get_race_weather', success: true }]} />);
    expand();

    expect(screen.getByText('Weather forecast')).toBeInTheDocument();
  });

  it('keeps the raw tool name visible alongside the label', () => {
    render(<ToolTrace tools={[{ tool: 'get_race_weather', success: true }]} />);
    expand();

    expect(screen.getByText('get_race_weather')).toBeInTheDocument();
  });

  it('renders one row per tool', () => {
    render(<ToolTrace tools={TOOLS} />);
    expand();

    expect(screen.getAllByRole('listitem')).toHaveLength(TOOLS.length);
    for (const tool of TOOLS) {
      expect(screen.getByText(toolLabel(tool.tool))).toBeInTheDocument();
      expect(screen.getByText(tool.tool)).toBeInTheDocument();
    }
  });

  it('keeps the header string, minus the emoji this phase removed', () => {
    render(<ToolTrace tools={TOOLS} />);
    const header = screen.getByRole('button');

    // The count is interpolated into the string, so the text is split across nodes and a naive
    // `getByText` of the whole sentence finds nothing — assert the button's textContent instead.
    expect(header.textContent).toContain(`Agent Tool Trace (${TOOLS.length} tools executed)`);
    expect(header.textContent).not.toContain('🔧');
  });

  it('hides the rows until the header is clicked, and tracks aria-expanded', () => {
    render(<ToolTrace tools={TOOLS} />);
    const header = screen.getByRole('button');

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).toBeNull();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(TOOLS.length);

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('keeps the disclosure glyph out of the button’s accessible name', () => {
    /*
     * `▼`/`▶` is a picture of the state `aria-expanded` already reports, so leaving it in the
     * accessible name makes the control announce as "Agent Tool Trace (2 tools executed) ▶" —
     * the state twice, once in a form no screen reader can render usefully. The `sr-only`
     * outcome runs in the rows below set the precedent: text that carries meaning is accessible,
     * marks that duplicate it are `aria-hidden`.
     *
     * Asserted through the accessible *name* rather than by looking for the attribute, because
     * the attribute is only the current means — a glyph swapped for an `aria-hidden` SVG would
     * still pass, and a glyph moved outside the button would too.
     */
    render(<ToolTrace tools={TOOLS} />);

    // `name` is matched exactly, and that is the whole assertion: RTL computes the real
    // accessible name through the same `aria-hidden`-aware algorithm a screen reader uses, so a
    // glyph still inside the name makes this query find nothing rather than merely read oddly.
    expect(
      screen.getByRole('button', {
        name: `Agent Tool Trace (${TOOLS.length} tools executed)`,
      }),
    ).toBeInTheDocument();

    // Collapsed and expanded print different glyphs; neither may reach the name.
    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByRole('button', {
        name: `Agent Tool Trace (${TOOLS.length} tools executed)`,
      }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('points aria-controls at the list it toggles', () => {
    // A disclosure button says *what* it expands. Without it the rows are just the next thing in
    // the DOM, and a screen-reader user who activates the control is told nothing appeared.
    render(<ToolTrace tools={TOOLS} />);
    const header = screen.getByRole('button');
    const controls = header.getAttribute('aria-controls');

    expect(controls, 'the disclosure button controls nothing').toBeTruthy();

    expand();
    expect(screen.getByRole('list')).toHaveAttribute('id', controls);
  });

  it('distinguishes a failed tool from a successful one in the accessibility tree', () => {
    /*
     * This replaces an assertion on the `OK` / `FAIL` badge text, which no longer exists: the
     * badges became a checkered-flag mini icon and a red cross, both `aria-hidden`. That swap is
     * *the* regression this restyle can cause — an icon-only status deletes the outcome from the
     * page for a screen-reader user while looking finished on screen — so the assertion is
     * deliberately on accessible text and never on the SVG.
     */
    render(<ToolTrace tools={TOOLS} />);
    expand();

    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    // …and the marks that carry it visually differ in *shape*, not only in hue, so a colour-blind
    // reader sees the difference too. `briefing-loader.tsx` sets the same precedent in this
    // feature; the flag is `<rect>`-only, so its presence in exactly the succeeded row is the
    // shape probe.
    const [succeeded, failed] = screen.getAllByRole('listitem');
    expect(succeeded!.querySelectorAll('svg')).toHaveLength(1);
    expect(failed!.querySelectorAll('svg')).toHaveLength(0);
    expect(failed!.textContent).toContain('×');
  });

  it('keeps every status mark out of the accessibility tree', () => {
    // The icons are decoration on top of the `sr-only` runs above; announcing both would read the
    // outcome twice, and announcing a bare "×" reads as nothing at all.
    render(<ToolTrace tools={TOOLS} />);
    expand();

    for (const row of screen.getAllByRole('listitem')) {
      const mark = row.querySelector('[aria-hidden="true"]');
      expect(mark).not.toBeNull();
    }
  });

  it('draws the laurel flourish around the header only once the run is complete', () => {
    const { container, unmount } = render(<ToolTrace tools={TOOLS} complete />);

    // Two branches × (one stem + six leaf-pairs). Asserting the count rather than "some svg
    // exists" separates the laurel from the checkered flag, which is `<rect>`-only.
    expect(laurelPaths(container)).toHaveLength(14);
    unmount();

    // `complete` defaults to false, and an incomplete run renders the header bare — not a laurel
    // held at zero opacity, which would be neither a static state nor a final one.
    const bare = render(<ToolTrace tools={TOOLS} />);
    expect(laurelPaths(bare.container)).toHaveLength(0);
  });

  it('renders the whole trace under reduced motion, laurel included', () => {
    /*
     * `useReducedMotionSafe` returns `false` on its first render and flips inside `act`, so a
     * plain `render()` here exercises the false→true transition rather than only the settled
     * branch. The outcome asserted is the *trace's*: every row's text present, and the laurel's
     * branches present and fully drawn (no dash pattern at all, which is what "half-drawn" would
     * look like). `laurel-flourish.test.tsx` owns the flourish's own behaviour.
     */
    reduceMotion = true;
    const { container } = render(<ToolTrace tools={TOOLS} complete />);
    fireEvent.click(screen.getByRole('button'));

    for (const tool of TOOLS) {
      expect(screen.getByText(toolLabel(tool.tool))).toBeInTheDocument();
      expect(screen.getByText(tool.tool)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(TOOLS.length);

    const paths = laurelPaths(container);
    expect(paths).toHaveLength(14);
    for (const path of paths) {
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
    }
  });

  it('measures the composited backdrop as lighter than the bare page, not darker', () => {
    // The premise the ratio assertion below rests on. If a future restyle drops the white washes,
    // this fails first and says so, instead of the suite silently measuring the wrong surface.
    expect(contrastRatio(ZINC['400']!, PAGE_BACKDROP)).toBeCloseTo(6.24, 1);
    expect(contrastRatio(ZINC['400']!, ROW_BACKDROP)).toBeLessThan(
      contrastRatio(ZINC['400']!, PAGE_BACKDROP),
    );
    // And the shade this restyle had to move off: `zinc-500` carried the raw tool id before, and
    // does not clear the bar on any layer of this panel.
    expect(contrastRatio(ZINC['500']!, ROW_BACKDROP)).toBeLessThan(MIN_CONTRAST);
  });

  it('keeps every resting neutral in the expanded panel readable', () => {
    render(<ToolTrace tools={TOOLS} complete />);
    expand();
    const panel = screen.getByRole('button').parentElement!;

    const neutrals = restingTextNeutrals(panel);

    /*
     * Non-vacuity, pinned rather than merely non-zero: a helper that finds nothing passes every
     * ratio assertion in silence, and one that finds *most* runs passes while the dropped one is
     * the broken one. The count is derived from the fixture — the header label and the chevron,
     * plus each row's display label and raw tool id — so adding a row moves it automatically while
     * a run losing its colour class does not.
     *
     * The three runs deliberately *not* here: the `sr-only` outcome (never painted), the red `×`
     * (a decorative mark under the 3:1 bar, not `text-zinc-N`), and the checkered flag (no text).
     */
    expect(neutrals).toHaveLength(2 + 2 * TOOLS.length);
    for (const { hex, text } of neutrals) {
      // The message names the run on screen, so a failure points at the markup rather than at a
      // bare number.
      expect(
        contrastRatio(hex, ROW_BACKDROP),
        `"${text}" at ${hex} over the row wash`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
