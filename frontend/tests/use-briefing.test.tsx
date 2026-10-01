/**
 * Tests for the useBriefing hook.
 *
 * The seam is the hook's public surface — the state it returns and `submit()` — driven
 * through the *real* `streamBriefing` over a controllable reader. Only `fetch` is faked,
 * so these exercise the parser and the hook together and nothing internal is reached into.
 *
 * Delta coalescing is the subject of most of it: the buffer is a ref, so the only way to
 * observe it is through what gets painted and when.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBriefing } from '@/hooks/use-briefing';
import { BRIEFING_DEADLINE_ERROR, GENERIC_BRIEFING_ERROR } from '@/lib/constants';
import { ChunkFeed, frame } from './sse';

const FLUSH_INTERVAL_MS = 80;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Let the stream's promise chain run without letting the flush timer fire. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
  });
}

/** Render the hook against `feeds`, served one per `fetch` call, and start a request. */
function start(...feeds: ChunkFeed[]) {
  let call = 0;
  globalThis.fetch = (() => feeds[call++]!.fetch()) as typeof fetch;

  let renders = 0;
  const rendered = renderHook(() => {
    renders++;
    return useBriefing();
  });

  return {
    ...rendered,
    renderCount: () => renders,
    submit: (query: string) => act(() => void rendered.result.current.submit(query)),
  };
}

describe('delta coalescing', () => {
  it('does not paint a delta the moment it arrives', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    await settle();

    expect(result.current.briefing).toBe('');
  });

  it('paints the accumulated prose once the flush timer fires', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    await settle();
    await flush();

    expect(result.current.briefing).toBe('## Mon');
  });

  it('coalesces deltas arriving inside one window into a single render', async () => {
    const feed = new ChunkFeed();
    const { result, submit, renderCount } = start(feed);
    await submit('Monaco');

    for (const content of ['## Mon', 'aco\n\n', 'Tight.']) {
      feed.push(frame('briefing_delta', { content }));
    }
    await settle();

    // This is the entire reason the buffer exists: three deltas, one paint. Painting per
    // delta re-parses the whole markdown string each time — quadratic in briefing length.
    const before = renderCount();
    await flush();

    expect(renderCount()).toBe(before + 1);
    expect(result.current.briefing).toBe('## Monaco\n\nTight.');
  });

  it('keeps painting as later deltas arrive', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    await settle();
    await flush();
    expect(result.current.briefing).toBe('## Mon');

    feed.push(frame('briefing_delta', { content: 'aco' }));
    await settle();
    await flush();

    expect(result.current.briefing).toBe('## Monaco');
  });
});

describe('the terminal briefing event', () => {
  it('paints its own content, not the accumulation plus its content', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: 'A' }));
    feed.push(frame('briefing_delta', { content: 'B' }));
    await settle();
    await flush();

    feed.push(frame('briefing', { content: 'AB', truncated: false }));
    await settle();

    // Appending would give 'ABAB'. The terminal event is a reconciliation anchor: it is
    // the authoritative full text, which is what makes a dropped delta recoverable.
    expect(result.current.briefing).toBe('AB');
  });

  it('doubles as the final flush, leaving no deltas stranded and no timer running', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    await settle();
    // Deliberately not flushed — a paint is still pending when the terminal event lands.
    feed.push(frame('briefing', { content: '## Monaco', truncated: false }));
    await settle();

    expect(result.current.briefing).toBe('## Monaco');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('corrects the rendered prose when a delta went missing', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    // 'aco' never arrives — a malformed frame that lib/api.ts swallowed silently.
    feed.push(frame('briefing', { content: '## Monaco', truncated: false }));
    await settle();

    expect(result.current.briefing).toBe('## Monaco');
  });
});

describe('truncation', () => {
  it('reports a completed synthesis as not truncated', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing', { content: '## Monaco', truncated: false }));
    await settle();

    expect(result.current.truncated).toBe(false);
  });

  it('reports a synthesis that stopped partway as truncated, and still keeps the prose', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing', { content: '## Mon', truncated: true }));
    await settle();

    expect(result.current.truncated).toBe(true);
    expect(result.current.briefing).toBe('## Mon');
    expect(result.current.error).toBe('');
  });

  it('clears truncation when a new request starts', async () => {
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);
    await submit('Monaco');

    first.push(frame('briefing', { content: '## Mon', truncated: true }));
    await settle();
    expect(result.current.truncated).toBe(true);

    await submit('Silverstone');

    expect(result.current.truncated).toBe(false);
  });
});

describe('request and lifecycle boundaries', () => {
  it('clears the pending flush timer on unmount', async () => {
    const feed = new ChunkFeed();
    const { submit, unmount } = start(feed);
    await submit('Monaco');

    feed.push(frame('briefing_delta', { content: '## Mon' }));
    await settle();
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not carry the previous briefing into the next one', async () => {
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);

    await submit('Monaco');
    first.push(frame('briefing_delta', { content: 'Monaco prose' }));
    await settle();
    await flush();
    expect(result.current.briefing).toBe('Monaco prose');

    await submit('Silverstone');
    expect(result.current.briefing).toBe('');

    second.push(frame('briefing_delta', { content: 'Silverstone prose' }));
    await settle();
    await flush();

    // The buffer is a ref shared across requests, so a failure here is not a late paint —
    // it is the previous race's prose prepended to this one's briefing.
    expect(result.current.briefing).toBe('Silverstone prose');
  });

  it('ignores a delta that surfaces from a superseded request', async () => {
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);

    await submit('Monaco');
    await submit('Silverstone');

    // In flight when the first request was aborted, and delivered afterwards.
    first.push(frame('briefing_delta', { content: 'stale' }));
    await settle();
    second.push(frame('briefing_delta', { content: 'fresh' }));
    await settle();
    await flush();

    expect(result.current.briefing).toBe('fresh');
  });
});

describe('other events', () => {
  it('surfaces the race name, status messages and the tool trace', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('status', { step: 'gathering', message: 'Gathering race data...' }));
    feed.push(frame('race_info', { name: 'Monaco Grand Prix' }));
    feed.push(frame('tool_result', { tool: 'get_track_info', success: true }));
    feed.push(frame('tool_result', { tool: 'search_f1_news', success: false }));
    await settle();

    expect(result.current.race).toBe('Monaco Grand Prix');
    expect(result.current.statusMessage).toBe('Gathering race data...');
    expect(result.current.toolTrace).toEqual([
      { tool: 'get_track_info', success: true },
      { tool: 'search_f1_news', success: false },
    ]);
  });

  it('keeps the whole race_info payload, not only its name', async () => {
    // The circuit band joins on `location` — `circuit_id` is derived from the *event* name
    // (`italian_grand_prix`) and names a Grand Prix rather than a track, so it misses most of the
    // calendar. Before this, the hook read `.name` and dropped the rest of the event, which made
    // the band impossible to build without a second request for data already on the wire.
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monza');

    const payload = {
      name: 'Italian Grand Prix',
      year: 2026,
      circuit_id: 'italian_grand_prix',
      location: 'Monza',
      country: 'Italy',
      date: '2026-09-06 00:00:00',
      is_upcoming: true,
      historical_year: 2025,
    };
    feed.push(frame('race_info', payload));
    await settle();

    expect(result.current.raceInfo).toEqual(payload);
    // `race` is kept alongside rather than derived: every existing consumer expects `''`, not
    // `null`, before the event lands.
    expect(result.current.race).toBe('Italian Grand Prix');
  });

  it('clears the previous run’s race_info when a new briefing is submitted', async () => {
    // A stale band under a fresh run would draw the wrong circuit for as long as the resolver
    // takes — several seconds — and look like a resolution bug rather than a reset one.
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);
    await submit('Monza');
    first.push(frame('race_info', { name: 'Italian Grand Prix', location: 'Monza' }));
    await settle();
    expect(result.current.raceInfo).not.toBeNull();

    await submit('Spa');
    expect(result.current.raceInfo).toBeNull();
  });

  it('surfaces an error event without inventing a briefing', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('error', { message: 'Could not find that race' }));
    await settle();

    expect(result.current.error).toBe('Could not find that race');
    expect(result.current.briefing).toBe('');
  });

  it('ignores a submit with a blank query', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);

    await submit('   ');

    expect(result.current.loading).toBe(false);
  });
});

describe('the pipeline step', () => {
  it('tracks the step of a status event, not its message', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('status', { step: 'gathering', message: 'Gathering race data...' }));
    await settle();

    expect(result.current.step).toBe('gathering');
  });

  it('advances as later stages report', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('status', { step: 'resolving', message: 'Resolving race...' }));
    await settle();
    feed.push(frame('status', { step: 'synthesizing', message: 'Generating briefing...' }));
    await settle();

    expect(result.current.step).toBe('synthesizing');
  });

  it('clears the step when the briefing lands', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('status', { step: 'synthesizing', message: 'Generating briefing...' }));
    await settle();
    feed.push(frame('briefing', { content: 'Done.', truncated: false }));
    await settle();

    expect(result.current.step).toBe('');
  });

  it('clears the step when a new request starts', async () => {
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);
    await submit('Monaco');

    first.push(frame('status', { step: 'gathering', message: 'Gathering race data...' }));
    await settle();
    await submit('Silverstone');

    expect(result.current.step).toBe('');
  });
});

describe('the tool plan', () => {
  it('starts empty', async () => {
    const feed = new ChunkFeed();
    const { result } = start(feed);

    expect(result.current.toolPlan).toEqual([]);
  });

  it('records the planned tools', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('tool_plan', { tools: ['get_track_info', 'search_f1_news'] }));
    await settle();

    expect(result.current.toolPlan).toEqual(['get_track_info', 'search_f1_news']);
  });

  it('clears the plan when a new request starts', async () => {
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);
    await submit('Monaco');

    first.push(frame('tool_plan', { tools: ['get_track_info'] }));
    await settle();
    await submit('Silverstone');

    expect(result.current.toolPlan).toEqual([]);
  });
});

describe('the request timestamp', () => {
  it('stamps startedAt when a request begins', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);

    expect(result.current.startedAt).toBe(0);
    await submit('Monaco');

    expect(result.current.startedAt).toBe(Date.now());
  });

  it('restamps startedAt on a second request, so the timer cannot carry over', async () => {
    // The loader does not unmount between overlapping runs. No on-screen control can
    // trigger one any more — the selector locks during a run — but `submit()` is a public
    // part of the hook's contract, callable programmatically, so the guard stays correct.
    const first = new ChunkFeed();
    const second = new ChunkFeed();
    const { result, submit } = start(first, second);
    await submit('Monaco');
    const firstStamp = result.current.startedAt;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await submit('Silverstone');

    expect(result.current.startedAt).toBe(firstStamp + 5000);
  });
});

/**
 * A refusal from the cost guard: the stream never opens, the body is JSON. Only `fetch` is
 * faked, as everywhere in this file, so the typed error really comes out of `streamBriefing`.
 */
function refusedWith(status: number, body: Record<string, unknown>): { fetch: () => Promise<Response> } {
  const response = {
    ok: false,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
  return { fetch: () => Promise.resolve(response) };
}

function startServing(...responses: { fetch: () => Promise<Response> }[]) {
  let call = 0;
  const fetchSpy = vi.fn(() => responses[call++]!.fetch());
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  const rendered = renderHook(() => useBriefing());
  return {
    ...rendered,
    fetchSpy,
    submit: (query: string) => act(() => void rendered.result.current.submit(query)),
  };
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('busy and limit refusals', () => {
  it('turns a 503 busy into a notice, not an error', async () => {
    const { result, submit } = startServing(
      refusedWith(503, { code: 'busy', retry_after_seconds: 10, limit: 2 }),
    );

    await submit('Monaco');
    await settle();

    expect(result.current.notice).toEqual({
      code: 'busy',
      retryAt: Date.now() + 10_000,
      waitSeconds: 10,
      limit: 2,
    });
    expect(result.current.retryInSeconds).toBe(10);
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('keeps the hourly limit the server sent with a 429', async () => {
    const { result, submit } = startServing(
      refusedWith(429, { code: 'rate_limited', retry_after_seconds: 1200, limit: 5 }),
    );

    await submit('Monaco');
    await settle();

    expect(result.current.notice?.code).toBe('rate_limited');
    expect(result.current.notice?.limit).toBe(5);
    expect(result.current.retryInSeconds).toBe(1200);
  });

  it('turns a 503 daily_cap into a notice that lasts until the reset', async () => {
    const { result, submit } = startServing(
      refusedWith(503, { code: 'daily_cap', retry_after_seconds: 3600, limit: 100 }),
    );

    await submit('Monaco');
    await settle();

    expect(result.current.notice?.code).toBe('daily_cap');
    expect(result.current.notice?.retryAt).toBe(Date.now() + 3_600_000);
  });

  it('counts the wait down one second at a time', async () => {
    const { result, submit } = startServing(
      refusedWith(503, { code: 'busy', retry_after_seconds: 10, limit: 2 }),
    );
    await submit('Monaco');
    await settle();

    await tick(1000);
    expect(result.current.retryInSeconds).toBe(9);

    await tick(3000);
    expect(result.current.retryInSeconds).toBe(6);
  });

  it('clears the notice on its own when the wait runs out', async () => {
    const { result, submit } = startServing(
      refusedWith(503, { code: 'busy', retry_after_seconds: 3, limit: 2 }),
    );
    await submit('Monaco');
    await settle();

    await tick(2999);
    expect(result.current.notice).not.toBeNull();

    await tick(1);
    expect(result.current.notice).toBeNull();
    expect(result.current.retryInSeconds).toBe(0);
  });

  it('refuses to submit while a wait is pending, and submits again once it is over', async () => {
    const after = new ChunkFeed();
    const { result, submit, fetchSpy } = startServing(
      refusedWith(503, { code: 'busy', retry_after_seconds: 2, limit: 2 }),
      after,
    );
    await submit('Monaco');
    await settle();

    await submit('Monaco');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await tick(2000);
    await submit('Monaco');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
  });

  it('stops ticking once the hook unmounts', async () => {
    const { submit, unmount } = startServing(
      refusedWith(503, { code: 'busy', retry_after_seconds: 10, limit: 2 }),
    );
    await submit('Monaco');
    await settle();

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('still reports an ordinary failure as the generic error', async () => {
    const { result, submit } = startServing(refusedWith(500, { detail: 'boom' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await submit('Monaco');
    await settle();

    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBe(GENERIC_BRIEFING_ERROR);
  });

  it('treats a refusal with no usable wait as an ordinary failure', async () => {
    const { result, submit } = startServing(refusedWith(503, { code: 'busy' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await submit('Monaco');
    await settle();

    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBe(GENERIC_BRIEFING_ERROR);
  });
});

describe('the deadline', () => {
  it('shows its own message when the stream ends on a deadline error', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(
      frame('error', { message: 'This briefing took too long and was stopped.', code: 'deadline' }),
    );
    feed.close();
    await settle();

    expect(result.current.error).toBe(BRIEFING_DEADLINE_ERROR);
    expect(result.current.notice).toBeNull();
  });

  it('leaves an uncoded error event as the server worded it', async () => {
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(frame('error', { message: "No race found matching 'xyz'" }));
    feed.close();
    await settle();

    expect(result.current.error).toBe("No race found matching 'xyz'");
  });
});
