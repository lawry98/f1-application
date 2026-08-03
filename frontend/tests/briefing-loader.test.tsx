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

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingLoader } from '@/components/briefing/briefing-loader';
import type { ToolResult } from '@/types';

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
    startedAt: number;
  }> = {},
) {
  const props = {
    race: 'Monaco Grand Prix',
    step: 'gathering',
    statusMessage: 'Gathering race data...',
    tools: [] as ToolResult[],
    startedAt: Date.now(),
    ...overrides,
  };

  return { ...render(<BriefingLoader {...props} />), props };
}

/** The row a stage label sits in, so its `data-state` can be read. */
function stageState(label: string): string | null | undefined {
  return screen.getByText(label).closest('li')?.getAttribute('data-state');
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

    expect(screen.getByText(/0:03\.0/)).toBeInTheDocument();
  });

  it('ticks while the run continues', () => {
    renderLoader({ startedAt: Date.now() });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/0:01\.5/)).toBeInTheDocument();
  });

  it('rolls into minutes', () => {
    renderLoader({ startedAt: Date.now() - 64_200 });

    expect(screen.getByText(/1:04\.2/)).toBeInTheDocument();
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
        startedAt={startedAt - 30_000}
      />,
    );

    expect(screen.getByText(/0:30\.0/)).toBeInTheDocument();

    rerender(
      <BriefingLoader
        race="Silverstone Grand Prix"
        step="resolving"
        statusMessage=""
        tools={[]}
        startedAt={startedAt}
      />,
    );

    expect(screen.getByText(/0:00\.0/)).toBeInTheDocument();
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
