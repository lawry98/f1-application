/**
 * Tests for the SSE consumer in lib/api.ts.
 *
 * These run against real bytes captured from the FastAPI route (see fixtures/README.md),
 * so what is pinned here is the *cross-stack* transport contract: the event set, their
 * order, and the payload shapes the `StreamEvent` union claims. A hand-written fixture
 * would let the backend drift away silently.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BriefingRequestError, getCircuitWinners, getStandings, streamBriefing } from '@/lib/api';
import type { StreamEvent } from '@/types';
import { ChunkFeed, type FixtureName, fetchInChunks, fixture, fixtureText } from './sse';
import { cutAfter, cutBefore, cutInsideData, deltasIn } from './sse-cuts';
import standings2026 from './fixtures/standings-2026.json';
import monzaWinners from './fixtures/circuit-winners-it-1922.json';

async function collect(name: FixtureName, chunkSize: number) {
  globalThis.fetch = fetchInChunks(fixture(name), chunkSize) as typeof fetch;
  const events: StreamEvent[] = [];
  for await (const event of streamBriefing('Monaco')) events.push(event);
  return events;
}

function contentOf(events: StreamEvent[], type: 'briefing' | 'briefing_delta'): string[] {
  return events.filter((e) => e.type === type).map((e) => (e.data as { content: string }).content);
}

// A frame straddling a chunk boundary exercises the generator's `remainder` handling.
// 7 bytes splits nearly every line; the large size delivers each body whole.
const CHUNK_SIZES = [7, 64, 100_000];

describe.each(CHUNK_SIZES)('streamBriefing (reader chunk size %i)', (chunkSize) => {
  it('yields the full event sequence of a clean run in order', async () => {
    const events = await collect('clean.sse', chunkSize);

    expect(events.map((e) => e.type)).toEqual([
      'status',
      'race_info',
      'status',
      'tool_plan',
      'status',
      'tool_result',
      'tool_result',
      'status',
      'briefing_delta',
      'briefing_delta',
      'briefing_delta',
      'briefing',
      'complete',
    ]);
  });

  it('carries the planned tool names', async () => {
    const events = await collect('clean.sse', chunkSize);
    const plan = events.find((e) => e.type === 'tool_plan');

    expect(plan?.data).toEqual({ tools: ['get_track_info', 'search_f1_news'] });
  });

  it('concatenates deltas into exactly the terminal briefing', async () => {
    const events = await collect('clean.sse', chunkSize);

    // The reconciliation guarantee, and the terminal event's entire justification: a
    // dropped delta has to be recoverable, because lib/api.ts swallows malformed frames.
    expect(contentOf(events, 'briefing_delta').join('')).toBe(contentOf(events, 'briefing')[0]);
  });

  it('reports a clean run as not truncated', async () => {
    const events = await collect('clean.sse', chunkSize);
    const briefing = events.find((e) => e.type === 'briefing');

    expect(briefing).toMatchObject({ data: { truncated: false } });
  });

  it('carries the truncated flag, and no error event, when synthesis stopped partway', async () => {
    const events = await collect('truncated.sse', chunkSize);

    expect(events.find((e) => e.type === 'briefing')).toMatchObject({
      data: { truncated: true },
    });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.at(-1)?.type).toBe('complete');
  });

  it('still reconstructs the prose that a truncated run managed to produce', async () => {
    const events = await collect('truncated.sse', chunkSize);

    expect(contentOf(events, 'briefing_delta').join('')).toBe(contentOf(events, 'briefing')[0]);
  });

  it('preserves newlines inside delta content', async () => {
    // Deltas split mid-markdown, so a delta routinely contains newlines — which is also
    // the one character that would break the SSE framing if it were not JSON-escaped.
    const events = await collect('clean.sse', chunkSize);

    expect(contentOf(events, 'briefing_delta')).toContain('aco\n\n');
  });
});

describe('streamBriefing error handling', () => {
  it('throws when the stream cannot be started', async () => {
    globalThis.fetch = (() => Promise.resolve({ ok: false } as Response)) as typeof fetch;

    await expect(streamBriefing('Monaco').next()).rejects.toThrow(
      'Failed to start briefing stream',
    );
  });

  it('skips malformed frames rather than aborting the stream', async () => {
    const body = new TextEncoder().encode(
      'event: briefing_delta\ndata: {not json\n\n' +
        'event: briefing\ndata: {"content": "ok", "truncated": false}\n\n',
    );
    globalThis.fetch = fetchInChunks(body, 100_000) as typeof fetch;

    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco')) events.push(event);

    expect(events.map((e) => e.type)).toEqual(['briefing']);
  });

  it('passes a deadline error event through with its code', async () => {
    const body = new TextEncoder().encode(
      'event: error\ndata: {"message": "This briefing took too long and was stopped.", "code": "deadline"}\n\n',
    );
    globalThis.fetch = fetchInChunks(body, 100_000) as typeof fetch;

    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco')) events.push(event);

    expect(events).toEqual([
      {
        type: 'error',
        data: { message: 'This briefing took too long and was stopped.', code: 'deadline' },
      },
    ]);
  });

  it('ignores event types it does not know', async () => {
    // Forward compatibility: a backend that grows a new event must not break an old client.
    const body = new TextEncoder().encode(
      'event: something_new\ndata: {"a": 1}\n\n' +
        'event: briefing\ndata: {"content": "ok", "truncated": false}\n\n',
    );
    globalThis.fetch = fetchInChunks(body, 100_000) as typeof fetch;

    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco')) events.push(event);

    expect(events.map((e) => e.type)).toEqual(['briefing']);
  });
});

/**
 * A run is finished when `briefing` (authoritative; `complete` follows) or `error` arrives.
 * Anything else that ends is an interruption, and the consumer is told so with an event rather
 * than left to infer it from the generator returning — which is all a finished run does too.
 *
 * Every broken stream here is the real `clean.sse` cut at runtime (`sse-cuts.ts`).
 */
describe.each(CHUNK_SIZES)('streamBriefing on a cut stream (reader chunk size %i)', (chunkSize) => {
  const clean = fixtureText('clean.sse');

  async function collectCut(text: string): Promise<StreamEvent[]> {
    globalThis.fetch = fetchInChunks(new TextEncoder().encode(text), chunkSize) as typeof fetch;
    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco')) events.push(event);
    return events;
  }

  it('ends with interrupted after the deltas that arrived, when cut after a delta', async () => {
    const events = await collectCut(cutAfter(clean, 'briefing_delta', 2));

    expect(events.map((e) => e.type).slice(-3)).toEqual([
      'briefing_delta',
      'briefing_delta',
      'interrupted',
    ]);
    expect(contentOf(events, 'briefing_delta')).toEqual(deltasIn(clean).slice(0, 2));
    expect(events.at(-1)).toEqual({ type: 'interrupted', data: { reason: 'ended' } });
  });

  it('ends with interrupted when cut before the first delta', async () => {
    const events = await collectCut(cutBefore(clean, 'briefing_delta'));

    expect(events.some((e) => e.type === 'briefing_delta')).toBe(false);
    expect(events.at(-2)).toMatchObject({ type: 'status', data: { step: 'synthesizing' } });
    expect(events.at(-1)?.type).toBe('interrupted');
  });

  it('drops a frame cut mid-data line rather than parsing half of it', async () => {
    const events = await collectCut(cutInsideData(clean, 'briefing_delta', 2));

    expect(contentOf(events, 'briefing_delta')).toEqual(deltasIn(clean).slice(0, 1));
    expect(events.at(-1)?.type).toBe('interrupted');
  });

  it('counts a stream cut after briefing but before complete as finished', async () => {
    const events = await collectCut(cutAfter(clean, 'briefing'));

    expect(events.at(-1)?.type).toBe('briefing');
    expect(events.some((e) => e.type === 'interrupted')).toBe(false);
  });

  it('counts a stream that ends on an error event as finished', async () => {
    const events = await collectCut(
      cutBefore(clean, 'briefing_delta') + 'event: error\r\ndata: {"message": "boom"}\r\n\r\n',
    );

    expect(events.at(-1)).toEqual({ type: 'error', data: { message: 'boom' } });
  });
});

describe('streamBriefing when the reader rejects', () => {
  const clean = fixtureText('clean.sse');

  async function collectFrom(feed: ChunkFeed, signal?: AbortSignal): Promise<StreamEvent[]> {
    globalThis.fetch = feed.fetch as typeof fetch;
    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco', signal)) events.push(event);
    return events;
  }

  it('ends with interrupted when the connection drops mid-stream', async () => {
    const feed = new ChunkFeed();
    feed.push(cutAfter(clean, 'briefing_delta', 1));
    feed.fail(new TypeError('network error'));

    const events = await collectFrom(feed);

    expect(contentOf(events, 'briefing_delta')).toEqual(deltasIn(clean).slice(0, 1));
    expect(events.at(-1)).toEqual({ type: 'interrupted', data: { reason: 'failed' } });
  });

  it('stays finished when the connection drops after the briefing landed', async () => {
    const feed = new ChunkFeed();
    feed.push(cutAfter(clean, 'briefing'));
    feed.fail(new TypeError('network error'));

    const events = await collectFrom(feed);

    expect(events.at(-1)?.type).toBe('briefing');
  });

  it('rethrows our own abort instead of reporting an interruption', async () => {
    const feed = new ChunkFeed();
    feed.push(cutAfter(clean, 'briefing_delta', 1));
    const controller = new AbortController();
    const events: StreamEvent[] = [];
    globalThis.fetch = feed.fetch as typeof fetch;

    const run = (async () => {
      for await (const event of streamBriefing('Monaco', controller.signal)) {
        events.push(event);
        if (event.type === 'briefing_delta') controller.abort();
      }
    })();

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(events.some((e) => e.type === 'interrupted')).toBe(false);
  });
});

/**
 * A refused stream, as the cost guard sends it: a plain JSON body and a Retry-After header.
 * Stubbed rather than built with `new Response`, for the reason `jsonResponse` below gives.
 */
function refusal(status: number, body: unknown, retryAfter?: string): Response {
  return {
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
    headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null) },
  } as unknown as Response;
}

async function refusalOf(response: Response): Promise<BriefingRequestError> {
  globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
  try {
    await streamBriefing('Monaco').next();
  } catch (err) {
    if (err instanceof BriefingRequestError) return err;
    throw err;
  }
  throw new Error('streamBriefing did not throw');
}

describe('streamBriefing refusals', () => {
  it('carries the status, code, wait and limit of a 429', async () => {
    const err = await refusalOf(
      refusal(429, { code: 'rate_limited', retry_after_seconds: 1200, limit: 5 }, '1200'),
    );

    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSeconds).toBe(1200);
    expect(err.limit).toBe(5);
  });

  it('carries a 503 busy', async () => {
    const err = await refusalOf(refusal(503, { code: 'busy', retry_after_seconds: 10, limit: 2 }));

    expect(err.status).toBe(503);
    expect(err.code).toBe('busy');
    expect(err.retryAfterSeconds).toBe(10);
  });

  it('falls back to the Retry-After header when the body cannot be read', async () => {
    const err = await refusalOf(refusal(503, undefined, '42'));

    expect(err.code).toBeNull();
    expect(err.retryAfterSeconds).toBe(42);
  });

  it('prefers the header to a body whose wait is not a number', async () => {
    const err = await refusalOf(refusal(429, { code: 'rate_limited', retry_after_seconds: 'soon' }, '30'));

    expect(err.retryAfterSeconds).toBe(30);
    expect(err.limit).toBeNull();
  });

  it('reads an HTTP-date Retry-After as the seconds until then', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T23:59:00Z'));
    try {
      const err = await refusalOf(refusal(503, undefined, 'Thu, 01 Oct 2026 00:00:00 GMT'));
      expect(err.retryAfterSeconds).toBe(60);
    } finally {
      vi.useRealTimers();
    }
  });

  it('knows no wait at all for an ordinary failure', async () => {
    const err = await refusalOf(refusal(500, { detail: 'boom' }));

    expect(err.status).toBe(500);
    expect(err.code).toBeNull();
    expect(err.retryAfterSeconds).toBeNull();
  });
});

/**
 * `getStandings` is a plain JSON fetch, so the only fetch surface it touches is `ok` and `json()`
 * — the stub is exactly that, which keeps this independent of whether the test environment
 * ships a `Response` constructor. The body is the captured route response, not a literal.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('getStandings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the standings route for the year and returns the payload as served', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(standings2026));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStandings(2026);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/standings\/2026$/));
    expect(result).toEqual(standings2026);
  });

  it('throws on a non-OK response rather than handing the error body on as a table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'Could not load the standings.' }, 502)),
    );

    await expect(getStandings(2026)).rejects.toThrow('Failed to fetch standings');
  });
});

describe('getCircuitWinners', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the winners route for the circuit id and returns the payload as served', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(monzaWinners));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCircuitWinners('it-1922');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/circuits\/it-1922\/winners$/),
    );
    expect(result).toEqual(monzaWinners);
  });

  it('throws on a non-OK response rather than handing the error body on as winners', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'x' }, 502)));

    await expect(getCircuitWinners('it-1922')).rejects.toThrow('Failed to fetch circuit winners');
  });
});
