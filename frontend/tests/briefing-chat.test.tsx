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
import { ChunkFeed, frame } from './sse';

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

/**
 * `BriefingChat` also mounts `RaceSelector`, which fetches `/api/races/:year` on its own.
 * Route on the URL so both callers share one `fetch` stub, the way the real app does.
 */
function stubFetch(feed: ChunkFeed): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/races/')) {
      return { ok: true, json: async () => ({ races: [] }) } as unknown as Response;
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

    expect(screen.getByText(/0:03\.0/)).toBeInTheDocument();
    expect(screen.getByText('Gather race data').closest('li')).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText('Track profile')).toBeInTheDocument();
  });
});
