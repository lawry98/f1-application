/**
 * Integration test for BriefingChat.
 *
 * `use-briefing.test.tsx` pins the hook's ownership of `startedAt`, `step` and the tool
 * trace; `briefing-loader.test.tsx` pins the panel's obedience to those same props. Neither
 * covers the five-line joint in `briefing-chat.tsx` that passes one to the other — a
 * plausible "simplification" there (e.g. `startedAt={Date.now()}` instead of the hook's
 * value) breaks the elapsed timer while every other test stays green. This drives the real
 * `streamBriefing` through `BriefingChat` with only `fetch` faked, the same harness as
 * `use-briefing.test.tsx`, and asserts the wiring end to end.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingChat } from '@/components/briefing/briefing-chat';
import { blendOver, contrastRatio, MIN_CONTRAST } from '@/lib/team-utils';
import { ChunkFeed, frame } from './sse';
import { restingTextNeutrals, ZINC } from './zinc';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Let a pending promise chain (fetch, JSON parsing, the SSE reader) settle. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const RACES = [
  {
    name: 'Monaco Grand Prix',
    location: 'Monaco',
    country: 'Monaco',
    date: '2099-05-25',
    round: 8,
  },
];

/**
 * The one painted copy of the elapsed value.
 *
 * `MegaStat` renders its value **twice** — an `aria-hidden` twin that reserves the numeral's
 * width so a ticking counter cannot reflow the row, plus the painted copy — so a bare
 * `getByText` now finds two nodes and throws. Filtering to the copy outside every `aria-hidden`
 * subtree keeps the assertion identical in meaning, and the `toHaveLength(1)` is itself the
 * guard: if the accessible copy ever became the hidden one, this fails rather than passing on
 * the decoration. `briefing-loader.test.tsx` carries the same helper for the same reason.
 */
function elapsedRun(pattern: RegExp): HTMLElement {
  const painted = screen.getAllByText(pattern).filter((el) => !el.closest('[aria-hidden="true"]'));
  expect(painted).toHaveLength(1);
  return painted[0]!;
}

/**
 * `BriefingChat` also mounts `RaceSelector`, whose calendar now arrives through `useRaces`, which
 * fetches `/api/races/:year` on its own. Route on the URL so both callers share one `fetch` stub,
 * the way the real app does.
 */
function stubFetch(feed: ChunkFeed): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/races/')) {
      return { ok: true, json: async () => ({ races: RACES }) } as unknown as Response;
    }
    return feed.fetch();
  }) as typeof fetch;
}

describe('BriefingChat wiring', () => {
  it('feeds the hook state into the loader: startedAt, the active stage and a tool label', async () => {
    const feed = new ChunkFeed();
    stubFetch(feed);

    render(<BriefingChat />);
    await settle(); // RaceSelector's own fetch effect

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await settle(); // starts the stream

    feed.push(frame('status', { step: 'gathering', message: 'Gathering race data...' }));
    await settle(1000);

    // Pushed partway through the run: if `startedAt` were recomputed on this render
    // (rather than owned by the hook) the elapsed baseline would jump forward here.
    feed.push(frame('tool_result', { tool: 'get_track_info', success: true }));
    await settle(2000);

    expect(elapsedRun(/0:03\.0/)).toBeInTheDocument();
    expect(screen.getByText('Gather race data').closest('li')).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText('Track profile')).toBeInTheDocument();
  });

  it('shows a pending chip from the plan before any tool has returned', async () => {
    // Pins `toolPlan={toolPlan}` at the `BriefingLoader` call site — a plausible
    // simplification that dropped the prop would leave the hook's plan on the floor and
    // nothing else in the suite would catch it.
    const feed = new ChunkFeed();
    stubFetch(feed);

    render(<BriefingChat />);
    await settle(); // RaceSelector's own fetch effect

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await settle(); // starts the stream

    feed.push(frame('tool_plan', { tools: ['get_track_info'] }));
    await settle();

    expect(screen.getByText('Track profile').closest('li')).toHaveAttribute(
      'data-state',
      'pending',
    );
  });

  it('locks the race selector once a submit is in flight', async () => {
    // Pins `disabled={loading}` at the `RaceSelector` call site — nothing else in the
    // suite would catch a regression that dropped it back to always-live buttons.
    const feed = new ChunkFeed();
    stubFetch(feed);

    render(<BriefingChat />);
    await settle(); // RaceSelector's own fetch effect

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await settle(); // starts the stream

    expect(screen.getByRole('button', { name: /monaco grand prix/i })).toBeDisabled();
  });
});

/**
 * The empty state and the two props the spec's Phase 6 design turns on.
 *
 * Both `loading={loading}` on `BriefingCard` and `complete={!loading}` on `ToolTrace` are one-word
 * call-site props whose absence is invisible to every other suite: the card would simply reveal
 * its final block while that block is still being written (spec rule 3 — the strobe), and the
 * trace would never draw its laurel. Nothing but a wiring test catches either.
 */
describe('BriefingChat empty state and reveal wiring', () => {
  it('replaces the car emoji with a display heading and keeps the instruction verbatim', async () => {
    stubFetch(new ChunkFeed());
    render(<BriefingChat />);
    await settle();

    expect(screen.getByRole('heading', { name: /select a race/i })).toBeInTheDocument();
    // The original sentence is the only instruction on the screen and survives the restyle.
    expect(
      screen.getByText('Select a race or enter a Grand Prix to generate your briefing'),
    ).toBeInTheDocument();
    // Every emoji on this page went in Phase 6 — the car here, the flag on the card's title, the
    // wrench on the trace, the cross on the error banner. Pinned by the four exact characters
    // rather than by a range: the `u` flag a range needs is rejected under this project's
    // compile target (TS1501), and naming them says which four went and why anyway.
    const body = document.body.textContent ?? '';
    for (const emoji of ['🏎️', '🏁', '🔧', '❌']) {
      expect(body, `${emoji} came back to /briefing`).not.toContain(emoji);
    }
  });

  it('holds the empty-state circuit at the opacity its contrast depends on', async () => {
    stubFetch(new ChunkFeed());
    const { container } = render(<BriefingChat />);
    await settle();

    // Not decoration: `zinc-500` strokes composited at full strength over this page's backdrop
    // drag `ink` to 4.37:1 and `zinc-300` to 3.27:1, both failing. At 0.20 the worst backdrop a
    // glyph here sits on measures 5.03:1 for `zinc-400` and 11.68:1 for `ink`. The class is the
    // only thing jsdom can see, so it is the only thing that can guard the measurement.
    const glow = container.querySelector('.opacity-\\[0\\.20\\]');
    expect(glow, 'the empty-state circuit lost its opacity cap').not.toBeNull();
    expect(glow).toHaveAttribute('aria-hidden', 'true');
    // Decorative and behind a heading — it must never eat the pointer.
    expect(glow?.className).toMatch(/(^|\s)pointer-events-none(\s|$)/);
  });

  it('keeps every empty-state text run above the floor over that circuit', async () => {
    stubFetch(new ChunkFeed());
    const { container } = render(<BriefingChat />);
    await settle();

    // The worst backdrop in the empty state is the plain outline at 0.20 over the page's topo
    // composite — not the bare page — so measuring against `zinc-950` would pass a run that
    // fails on screen. This is the mistake CLAUDE.md records shipping twice.
    const page = blendOver(ZINC['300']!, 0.12, '#09090b');
    const worst = blendOver(ZINC['500']!, 0.2, page);

    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length, 'no runs found — the helper is measuring nothing').toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(
        contrastRatio(hex, worst),
        `"${text}" is unreadable over the circuit`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('tells the card the stream is still writing, so the final block stays bare', async () => {
    const feed = new ChunkFeed();
    stubFetch(feed);
    render(<BriefingChat />);
    await settle();

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await settle();

    feed.push(frame('briefing_delta', { content: '## One\n\nFirst.\n\n## Two\n\nStill writing' }));
    await settle(200); // past the hook's 80ms flush

    const blocks = document.querySelectorAll('[data-reveal-ordinal]');
    expect(blocks.length, 'no reveal-wrapped blocks rendered').toBeGreaterThan(1);

    /**
     * Rule 3 removes the **bar**, not the block's identity: every block keeps its
     * `data-reveal-ordinal` so its ordinal stays stable across the ~12 re-parses a second the
     * flush interval produces, and only the `aria-hidden` redaction span is withheld. Asserting
     * the wrapper were absent would pin the opposite of the design — the ordinal surviving is
     * precisely what stops the earlier bars restarting.
     */
    const barsIn = (text: string): number => {
      const wrapper = screen.getByText(text).closest('[data-reveal-ordinal]');
      expect(wrapper, `"${text}" is not inside a reveal block`).not.toBeNull();
      return wrapper!.querySelectorAll('[aria-hidden="true"]').length;
    };

    // The block the synthesizer is still appending to carries no bar. A bar there re-wipes on
    // every 80ms flush and the page strobes.
    expect(barsIn('Still writing'), 'the growing final block was given a bar').toBe(0);
    expect(barsIn('First.'), 'a settled block lost its bar').toBeGreaterThan(0);
  });

  it('tells the trace the run has finished once the terminal event lands', async () => {
    const feed = new ChunkFeed();
    stubFetch(feed);
    render(<BriefingChat />);
    await settle();

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await settle();

    feed.push(frame('tool_result', { tool: 'get_track_info', success: true }));
    feed.push(frame('briefing', { content: '## Done\n\nComplete.', truncated: false }));
    feed.close();
    await settle(200);

    // `complete={!loading}` — the laurel is the visible consequence, and it only exists once the
    // stream has ended. The trace is mounted from the first flush, so "rendered" is not "done".
    const trace = screen.getByRole('button', { name: /agent tool trace/i });
    expect(trace.querySelector('svg'), 'the completed trace drew no laurel').not.toBeNull();
  });
});
