/**
 * Tests for BriefingLoader.
 *
 * What is pinned here is what the panel *claims*: which stage is active, how long the run
 * has taken, and which tools came back. Tailwind classes are not pinned — hence the
 * `data-state` attribute, which is the stage contract in a form a test can read.
 *
 * Fake timers are required. The elapsed timer ticks on an interval, and its baseline is a
 * prop, so both the initial read and the tick need a controlled clock.
 */

import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingLoader } from '@/components/briefing/briefing-loader';
import { DARK_BG, blendOver, contrastRatio } from '@/lib/team-utils';
import type { ToolResult } from '@/types';
import { ZINC, restingTextNeutrals } from './zinc';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Render with sensible defaults, overridable per test. */
function renderLoader(
  overrides: Partial<{
    race: string;
    step: string;
    statusMessage: string;
    tools: ToolResult[];
    toolPlan: string[];
    startedAt: number;
  }> = {},
) {
  const props = {
    race: 'Monaco Grand Prix',
    step: 'gathering',
    statusMessage: 'Gathering race data...',
    tools: [] as ToolResult[],
    toolPlan: [] as string[],
    startedAt: Date.now(),
    ...overrides,
  };

  return { ...render(<BriefingLoader {...props} />), props };
}

/** The row a stage label sits in, so its `data-state` can be read. */
function stageState(label: string): string | null | undefined {
  return screen.getByText(label).closest('li')?.getAttribute('data-state');
}

/**
 * The painted copy of the elapsed value — the one a reader actually gets.
 *
 * The timer now renders through `MegaStat`, which reserves the final value's width from the first
 * frame by putting the value in the DOM **twice**: an `invisible aria-hidden` twin sized to the
 * finished string, and the live copy in the same grid cell. A bare `getByText(/0:03\.0/)` therefore
 * matches two nodes and throws, which is why every elapsed assertion below goes through here
 * instead. This is a query change, not a weakening: filtering to the copy outside any `aria-hidden`
 * subtree measures the same thing the old single `<p>` did, and pinning it to exactly one match is
 * itself a guard — if the accessible copy ever became hidden too, the run time would be announced
 * nowhere and this would fail rather than quietly pass on the invisible twin.
 */
function elapsedRun(pattern: RegExp): HTMLElement {
  const painted = screen.getAllByText(pattern).filter((el) => !el.closest('[aria-hidden="true"]'));
  expect(painted).toHaveLength(1);
  return painted[0]!;
}

/** The footer's own chips, scoped to its container so these order checks do not
 *  depend on the stage `<ol>` staying `aria-hidden`. */
function footerChips(): HTMLElement[] {
  const footer = screen.getByText(/agent tool trace/i).closest('div');
  if (!footer) throw new Error('tool trace footer not found');
  return within(footer).getAllByRole('listitem');
}

describe('stage progression', () => {
  it('splits the stages into done, active and pending around the live step', () => {
    renderLoader({ step: 'gathering' });

    expect(stageState('Resolve race')).toBe('done');
    expect(stageState('Plan data gathering')).toBe('done');
    expect(stageState('Gather race data')).toBe('active');
    expect(stageState('Synthesize briefing')).toBe('pending');
  });

  it('moves the active row as the run advances', () => {
    renderLoader({ step: 'synthesizing' });

    expect(stageState('Gather race data')).toBe('done');
    expect(stageState('Synthesize briefing')).toBe('active');
  });

  it('opens on the first stage before any status event has arrived', () => {
    // `step` is '' for the first moments of every run. A blank panel would read as broken.
    renderLoader({ step: '' });

    expect(stageState('Resolve race')).toBe('active');
    expect(stageState('Plan data gathering')).toBe('pending');
  });

  it('falls back to the first stage for a step it does not recognise', () => {
    renderLoader({ step: 'reticulating_splines' });

    expect(stageState('Resolve race')).toBe('active');
  });
});

describe('the race name', () => {
  it('shows the resolved race once it is known', () => {
    renderLoader({ race: 'Monaco Grand Prix' });

    expect(screen.getByText('Monaco Grand Prix')).toBeInTheDocument();
  });

  it('says it is still resolving before the race is known', () => {
    renderLoader({ race: '' });

    expect(screen.getByText(/resolving race/i)).toBeInTheDocument();
  });
});

describe('the elapsed timer', () => {
  it('reads from startedAt, not from mount time', () => {
    renderLoader({ startedAt: Date.now() - 3000 });

    expect(elapsedRun(/0:03\.0/)).toBeInTheDocument();
  });

  it('ticks while the run continues', () => {
    renderLoader({ startedAt: Date.now() });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(elapsedRun(/0:01\.5/)).toBeInTheDocument();
  });

  it('rolls into minutes', () => {
    renderLoader({ startedAt: Date.now() - 64_200 });

    expect(elapsedRun(/1:04\.2/)).toBeInTheDocument();
  });

  it('restarts from a fresh startedAt without a remount', () => {
    // Overlapping runs do not remount the loader — see ticket 01. The displayed time has
    // to follow the prop, or the new run inherits the abandoned one's clock.
    const startedAt = Date.now();
    const { rerender } = render(
      <BriefingLoader
        race="Monaco Grand Prix"
        step="gathering"
        statusMessage=""
        tools={[]}
        toolPlan={[]}
        startedAt={startedAt - 30_000}
      />,
    );

    expect(elapsedRun(/0:30\.0/)).toBeInTheDocument();

    rerender(
      <BriefingLoader
        race="Silverstone Grand Prix"
        step="resolving"
        statusMessage=""
        tools={[]}
        toolPlan={[]}
        startedAt={startedAt}
      />,
    );

    expect(elapsedRun(/0:00\.0/)).toBeInTheDocument();
  });

  it('stops ticking after unmount', () => {
    const { unmount } = renderLoader({ startedAt: Date.now() });
    unmount();

    // A surviving interval calling setState on an unmounted component is the leak here;
    // advancing the clock after unmount is how it surfaces.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the elapsed stat callout', () => {
  /**
   * `MegaStat`'s `mid` scale, verbatim. Pinned as a string because it *is* the spec's requirement
   * for this phase ("stat callouts render at MegaStat mid scale") — jsdom applies no stylesheet, so
   * the class name is the only evidence a test can reach, and the alternative (asserting the
   * component rendered at all) would pass just as happily at `mega`, which would overflow the card.
   */
  const MID_SCALE_CLASS = 'text-[clamp(2.5rem,6vw,4.5rem)]';

  /** Exact class-token match. `\b` cannot bound an arbitrary-value Tailwind class — `[`, `]` and
   *  `,` are all non-word characters — so this splits on whitespace instead of using a regex. */
  function withClass(container: HTMLElement, token: string): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('*')).filter((el) =>
      (el.getAttribute('class') ?? '').split(/\s+/).includes(token),
    );
  }

  it('renders the run time at the mid display scale, not as body text', () => {
    const { container } = renderLoader({ startedAt: Date.now() - 3000 });

    const sized = withClass(container, MID_SCALE_CLASS);

    // Exactly one: `/briefing` has a single numeric callout, and a second one appearing would mean
    // some other run had been promoted to display scale inside an 896px card.
    expect(sized).toHaveLength(1);
    expect(sized[0]!).toHaveTextContent('0:03.0');
  });

  it('still tells a screen reader the number is an elapsed time', () => {
    // Asserted through accessible text rather than a class, because the label moved: the old
    // `sr-only "Elapsed "` prefix was dropped in favour of `MegaStat`'s own visible `label`, and
    // what has to survive that swap is the *reading order*, not any particular element.
    const { container } = renderLoader({ startedAt: Date.now() - 3000 });

    const accessible = container.cloneNode(true) as HTMLElement;
    accessible.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
    const text = accessible.textContent ?? '';

    expect(text.replace(/\s+/g, ' ')).toMatch(/Elapsed\s*0:03\.0/);
    // And exactly once. `MegaStat`'s width-reserving twin holds a second copy of the same string;
    // if it ever stopped being `aria-hidden`, the timer would be announced twice per tick.
    expect(text.match(/0:03\.0/g)).toHaveLength(1);
  });
});

describe('the tool footer', () => {
  it('is absent before any tool has returned', () => {
    renderLoader({ tools: [] });

    expect(screen.queryByText(/agent tool trace/i)).not.toBeInTheDocument();
  });

  it('appears with a labelled chip once a tool returns', () => {
    renderLoader({ tools: [{ tool: 'get_race_weather', success: true }] });

    expect(screen.getByText(/agent tool trace/i)).toBeInTheDocument();
    expect(screen.getByText('Weather forecast')).toBeInTheDocument();
  });

  it('keeps chips in arrival order', () => {
    renderLoader({
      tools: [
        { tool: 'get_track_info', success: true },
        { tool: 'get_driver_form', success: true },
      ],
    });

    const first = screen.getByText('Track profile');
    const second = screen.getByText('Driver form');

    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not signal failure by colour alone', () => {
    renderLoader({ tools: [{ tool: 'search_f1_news', success: false }] });

    // The visible marker: a colour-blind reader needs a shape difference, not just red vs
    // green. The sr-only text below is a second, independent channel for AT — neither
    // assertion substitutes for the other.
    expect(screen.getByText('×')).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('says nothing about failure for a tool that succeeded', () => {
    renderLoader({ tools: [{ tool: 'search_f1_news', success: true }] });

    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('shows no failure marker for a tool that succeeded', () => {
    renderLoader({ tools: [{ tool: 'search_f1_news', success: true }] });

    expect(screen.queryByText('×')).not.toBeInTheDocument();
  });
});

describe('the planned tool chips', () => {
  it('shows a pending chip for every planned tool before any result', () => {
    renderLoader({ toolPlan: ['get_track_info', 'get_race_weather'], tools: [] });

    expect(screen.getByText('Track profile').closest('li')).toHaveAttribute(
      'data-state',
      'pending',
    );
    expect(screen.getByText('Weather forecast').closest('li')).toHaveAttribute(
      'data-state',
      'pending',
    );
  });

  it('shows the footer as soon as a plan exists, with no results yet', () => {
    // This is the whole point: the footer covers the ~15s gathering stage instead of
    // appearing for the last moment of it.
    renderLoader({ toolPlan: ['get_track_info'], tools: [] });

    expect(screen.getByText(/agent tool trace/i)).toBeInTheDocument();
  });

  it('fills a chip in when its result arrives, leaving the others pending', () => {
    renderLoader({
      toolPlan: ['get_track_info', 'get_race_weather'],
      tools: [{ tool: 'get_race_weather', success: true }],
    });

    expect(screen.getByText('Weather forecast').closest('li')).toHaveAttribute('data-state', 'ok');
    expect(screen.getByText('Track profile').closest('li')).toHaveAttribute(
      'data-state',
      'pending',
    );
  });

  it('marks a returned tool that failed', () => {
    renderLoader({
      toolPlan: ['search_f1_news'],
      tools: [{ tool: 'search_f1_news', success: false }],
    });

    expect(screen.getByText('News search').closest('li')).toHaveAttribute('data-state', 'failed');
    expect(screen.getByText('×')).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('keeps chips in the plan order even when results arrive out of order', () => {
    // Six tools racing in a pool finish however they finish. Reordering chips as they land
    // would make the footer twitch for fifteen seconds.
    renderLoader({
      toolPlan: ['get_track_info', 'get_race_weather', 'search_f1_news'],
      tools: [
        { tool: 'search_f1_news', success: true },
        { tool: 'get_track_info', success: true },
      ],
    });

    const labels = footerChips().map((li) => li.textContent);

    expect(labels?.[0]).toContain('Track profile');
    expect(labels?.[1]).toContain('Weather forecast');
    expect(labels?.[2]).toContain('News search');
  });

  it('falls back to arrival order when the plan is missing', () => {
    // Degrades to exactly what shipped before, not to nothing.
    renderLoader({
      toolPlan: [],
      tools: [
        { tool: 'search_f1_news', success: true },
        { tool: 'get_track_info', success: true },
      ],
    });

    const labels = footerChips().map((li) => li.textContent);

    expect(labels?.[0]).toContain('News search');
    expect(labels?.[1]).toContain('Track profile');
  });

  it('shows no footer with neither a plan nor a result', () => {
    renderLoader({ toolPlan: [], tools: [] });

    expect(screen.queryByText(/agent tool trace/i)).not.toBeInTheDocument();
  });
});

describe('the gathering sub-line', () => {
  it('counts returned tools against the plan', () => {
    renderLoader({
      step: 'gathering',
      toolPlan: ['get_track_info', 'get_race_weather', 'search_f1_news'],
      tools: [{ tool: 'get_track_info', success: true }],
    });

    expect(screen.getByText('1 of 3 tools returned')).toBeInTheDocument();
  });

  it('omits the total when there is no plan to count against', () => {
    // Counting up without a denominator is still real. A made-up denominator is not.
    renderLoader({
      step: 'gathering',
      toolPlan: [],
      tools: [{ tool: 'get_track_info', success: true }],
    });

    expect(screen.getByText('1 tool returned')).toBeInTheDocument();
  });

  it('says nothing on the stages that have nothing true to report', () => {
    renderLoader({ step: 'synthesizing', toolPlan: ['get_track_info'], tools: [] });

    expect(screen.queryByText(/tools? returned/i)).not.toBeInTheDocument();
  });
});

describe('the stage elapsed hint', () => {
  it('says nothing before the threshold', () => {
    renderLoader({ step: 'synthesizing' });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText(/in this stage/i)).not.toBeInTheDocument();
  });

  it('reports the time once a stage has run long enough to wonder about', () => {
    renderLoader({ step: 'synthesizing' });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText('15s in this stage')).toBeInTheDocument();
  });

  it('puts the hint on the active row, not a completed one', () => {
    renderLoader({ step: 'synthesizing' });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText(/in this stage/i).closest('li')).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('restarts when the pipeline advances a stage', () => {
    const { rerender, props } = renderLoader({ step: 'gathering' });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('20s in this stage')).toBeInTheDocument();

    rerender(<BriefingLoader {...props} step="synthesizing" />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('4s in this stage')).toBeInTheDocument();
    expect(screen.queryByText('24s in this stage')).not.toBeInTheDocument();
  });

  it('restarts on a new request even when the stage name has not changed', () => {
    // Overlapping runs do not remount the loader, and a resubmit can land while `step`
    // still holds its old value — so the stage clock has to follow `startedAt` too, or the
    // new run opens showing the abandoned run's stage time.
    const { rerender, props } = renderLoader({ step: 'gathering' });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    rerender(<BriefingLoader {...props} step="gathering" startedAt={Date.now()} />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('4s in this stage')).toBeInTheDocument();
    expect(screen.queryByText('24s in this stage')).not.toBeInTheDocument();
  });

  it('shows the hint at exactly the threshold, not a tick later', () => {
    // `>=`, not `>`. The boundary is the part a future edit is most likely to move
    // without noticing, since every other test sits comfortably to one side of it.
    renderLoader({ step: 'synthesizing' });

    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.queryByText(/in this stage/i)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('3s in this stage')).toBeInTheDocument();
  });

  it('shows the tool count and the stage time together while gathering', () => {
    renderLoader({
      step: 'gathering',
      toolPlan: ['get_track_info', 'get_race_weather'],
      tools: [{ tool: 'get_track_info', success: true }],
    });

    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(screen.getByText('1 of 2 tools returned')).toBeInTheDocument();
    expect(screen.getByText('9s in this stage')).toBeInTheDocument();
  });
});

/**
 * The stage list's status line — the row under each stage label that carries the tool count and
 * the stage clock.
 *
 * **This is a layout-shift guard, and jsdom cannot see the thing it guards.** Measured in Chromium
 * at 1440x1600 against the fake stream, the line arriving at 3s into a stage and leaving when the
 * stage changed scored 0.001064 + 0.000983 = 0.002047 of layout shift, moving three stage rows and
 * the tool-trace footer with it — on a page whose spec success criterion is CLS 0. So the slot is
 * now unconditional: every stage row renders it, empty or not, at a fixed height.
 *
 * What is asserted here is therefore the *structure* that makes the height constant — one status
 * line per row, always, whatever the run is doing — not the height itself, which no jsdom test can
 * read. The browser measurement is the real evidence and it is recorded above.
 */
describe('the status line slot', () => {
  /** The stage rows. `getAllByRole('listitem')` cannot see them — the `<ol>` is `aria-hidden`. */
  const stageRows = (container: HTMLElement): Element[] =>
    Array.from(container.querySelectorAll('ol > li'));

  /** Label line + status line. Two `<p>` per row is the invariant; the count is the assertion. */
  const paragraphsPerRow = (container: HTMLElement): number[] =>
    stageRows(container).map((li) => li.querySelectorAll('p').length);

  it('renders one on every row when no stage has anything to report', () => {
    const { container } = renderLoader({ step: 'resolving', toolPlan: [], tools: [] });

    expect(paragraphsPerRow(container)).toEqual([2, 2, 2, 2]);
  });

  it('still renders one on every row once the hint has arrived', () => {
    const { container } = renderLoader({ step: 'gathering', toolPlan: ['get_track_info'] });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    // Non-vacuity: without this the row count below would pass on a panel showing no hint at all.
    expect(screen.getByText('15s in this stage')).toBeInTheDocument();

    expect(paragraphsPerRow(container)).toEqual([2, 2, 2, 2]);
  });

  it('still renders one on every row after the pipeline advances and the hint disappears', () => {
    // The 5.2s shift in the browser trace: the stage moved on, the hint went with it, and every
    // row below moved up. The count has to be identical on both sides of that transition.
    const { container, rerender, props } = renderLoader({ step: 'gathering' });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    rerender(<BriefingLoader {...props} step="synthesizing" />);

    expect(screen.queryByText('15s in this stage')).not.toBeInTheDocument();
    expect(paragraphsPerRow(container)).toEqual([2, 2, 2, 2]);
  });

  it('pins the slot to a fixed height rather than letting its content size it', () => {
    /*
     * The one class assertion in this file, and it earns the exception: the height *is* the fix,
     * and jsdom applies no stylesheet, so there is nothing else to read. `h-4` with `leading-4`
     * means the box is 16px whether it holds nothing, one run or two, and `truncate` is what stops
     * a long composite line wrapping to a second one at a narrow width — the other way the row
     * could still change height.
     */
    const { container } = renderLoader({ step: 'gathering' });

    for (const row of stageRows(container)) {
      const status = row.querySelectorAll('p')[1]!;
      expect(status.className).toContain('h-4');
      expect(status.className).toContain('leading-4');
      expect(status.className).toContain('truncate');
    }
  });
});

describe('accessibility', () => {
  it('announces the backend status message through a live region', () => {
    renderLoader({ statusMessage: 'Gathering race data...' });

    const live = screen.getByRole('status');

    expect(live).toHaveTextContent('Gathering race data...');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('hides the visual stage list from assistive tech', () => {
    // The live region already carries the backend's own wording; announcing four rows on
    // every transition would be noise layered on top of it.
    renderLoader({ step: 'gathering' });

    expect(screen.getByText('Gather race data').closest('ol')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('contrast', () => {
  /**
   * What is actually behind this panel's text.
   *
   * `/briefing` paints `bg-zinc-950` under a `<TopoBackground className="text-zinc-300" />` at the
   * texture's built-in `opacity-[0.12]`, so the page backdrop is **not** `#09090b` — it composites
   * to `rgb(33, 33, 36)`, and every ratio in the phase brief starts there. Measuring against the
   * bare page would report every run optimistically, which is the one contrast mistake this repo
   * records shipping twice: the right colour against the wrong background.
   *
   * The loader's own card (`bg-zinc-900/95`) and its footer (`bg-zinc-950/50`) both composite
   * *darker* than this, so a run that clears the bar here clears it on the card too — this backdrop
   * is the conservative bound for the whole component, not an approximation of one.
   */
  const PAGE_BACKDROP = blendOver(ZINC['300']!, 0.12, DARK_BG);

  /** WCAG AA for small text. Every run this panel paints is 14px or under. */
  const MIN_CONTRAST = 4.5;

  function renderFullPanel() {
    const rendered = renderLoader({
      step: 'gathering',
      toolPlan: ['get_track_info', 'get_race_weather', 'search_f1_news'],
      tools: [{ tool: 'get_track_info', success: true }],
    });

    // Past STAGE_HINT_AFTER_MS, so the stage hint is on screen and gets measured with everything
    // else — it was one of the zinc-500 runs this phase raised.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    return rendered;
  }

  it('keeps every resting neutral run above the small-text floor', () => {
    const { container } = renderFullPanel();

    const neutrals = restingTextNeutrals(container);

    // Non-vacuity. A helper that finds nothing passes every ratio assertion below in silence.
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, PAGE_BACKDROP), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('measures the runs that used to be too dim, and the count does not drift', () => {
    // The loop above only proves what it can see. These are the specific runs the restyle raised —
    // three were `zinc-500` (3.32:1 on this backdrop) and two `zinc-600` (2.14:1) — so naming them
    // is what stops the ratio loop passing because a run stopped being reported rather than because
    // it got brighter.
    const { container } = renderFullPanel();

    const texts = restingTextNeutrals(container).map((run) => run.text);

    expect(texts).toContain('Synthesize briefing'); // pending stage label, was zinc-600
    expect(texts).toContain('News search'); // pending chip label, was zinc-600
    expect(texts).toContain('Agent tool trace'); // footer kicker, was zinc-500
    expect(texts).toContain('1 of 3 tools returned'); // was zinc-500
    // '15 s …', with a space: that line is `{n}s in this stage`, i.e. two sibling text nodes, and
    // `restingTextNeutrals` joins an element's own text children with a space. The gap is an
    // artefact of the helper's keying, not of the rendered copy — `getByText('15s in this stage')`
    // above still matches the paint.
    expect(texts).toContain('15 s in this stage'); // was zinc-500
    expect(texts).toContain('Elapsed'); // MegaStat's own label
    // The separator between the two active sub-lines, now that they share one fixed-height line.
    // It is painted text like any other and takes the same `zinc-400` from the line it sits in.
    expect(texts).toContain('·');

    // Pinned: three stage labels (the active one is `text-white`, not a zinc class, so the helper
    // correctly reports nothing for it), the two active sub-lines and the separator between them,
    // the footer kicker, three chip labels, and the stat label. A drop here means a run lost its
    // colour source and went unmeasured; a rise means new text arrived that nobody has judged.
    // The three *empty* status lines on the inactive rows are correctly absent: they hold no text
    // node at all, which is the whole point of them.
    expect(texts).toHaveLength(11);
  });

  it('does not measure the red kicker, because it is not a zinc run at all', () => {
    // `restingTextNeutrals` reads `text-zinc-N` classes, so `text-f1-red` is outside its remit —
    // confirmed here rather than assumed, and pinned at zero so this exclusion cannot silently
    // widen into "the helper stopped seeing things". The kicker is a settled branch-wide idiom
    // (3.22:1) that the parent has logged; it is deliberately not changed in this file.
    const { container } = renderFullPanel();

    const kickerRuns = restingTextNeutrals(container).filter((run) =>
      /Generating briefing/.test(run.text),
    );

    expect(kickerRuns).toHaveLength(0);
    expect(screen.getByText('Generating briefing')).toHaveClass('text-f1-red');
  });
});
