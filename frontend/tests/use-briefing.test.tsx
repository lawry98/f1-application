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
