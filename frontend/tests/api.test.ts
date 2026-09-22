/**
 * Tests for the SSE consumer in lib/api.ts.
 *
 * These run against real bytes captured from the FastAPI route (see fixtures/README.md),
 * so what is pinned here is the *cross-stack* transport contract: the event set, their
 * order, and the payload shapes the `StreamEvent` union claims. A hand-written fixture
 * would let the backend drift away silently.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStandings, streamBriefing } from '@/lib/api';
import type { StreamEvent } from '@/types';
import { type FixtureName, fetchInChunks, fixture } from './sse';
import standings2026 from './fixtures/standings-2026.json';

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

  it('ignores event types it does not know', async () => {
    // Forward compatibility: a backend that grows a new event must not break an old client.
    const body = new TextEncoder().encode(
      'event: something_new\ndata: {"a": 1}\n\n' +
        'event: complete\ndata: {"message": "Briefing complete"}\n\n',
    );
    globalThis.fetch = fetchInChunks(body, 100_000) as typeof fetch;

    const events: StreamEvent[] = [];
    for await (const event of streamBriefing('Monaco')) events.push(event);

    expect(events.map((e) => e.type)).toEqual(['complete']);
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
