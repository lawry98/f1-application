/**
 * The saved-example fallback on `/briefing`: when a live briefing cannot run, the visitor is
 * offered the saved example for that race, and anyone can open one from the link under the input.
 *
 * The index and the loader are mocked with one example built from the shared check fixture, so
 * these tests do not move when a race is recaptured. Everything else is the real page: the real
 * hook, the real `streamBriefing`, only `fetch` faked — the harness `briefing-chat.test.tsx` uses.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingChat, BriefingChatFromUrl } from '@/components/briefing/briefing-chat';
import { ChunkFeed, frame } from './sse';

const { SUMMARY, search } = vi.hoisted(() => ({
  SUMMARY: {
    id: '2026-06-monaco-grand-prix',
    event: 'Monaco Grand Prix',
    year: 2026,
    round: 6,
    circuit: 'Circuit de Monaco',
    captured_at: '2026-10-01T17:00:00+00:00',
    as_of: '2026-06-05T11:30:00+00:00',
    is_upcoming: false,
  },
  search: { current: '' },
}));

vi.mock('@/data/briefing-examples/index.json', () => ({ default: [SUMMARY] }));

vi.mock('@/lib/briefing-examples', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/briefing-examples')>();
  const cases = (await import('./fixtures/briefing-check-cases.json')).default;
  const example = { ...cases.bases.monaco, id: SUMMARY.id, captured_at: SUMMARY.captured_at };
  return {
    ...actual,
    loadBriefingExample: vi.fn(async (id: string) => (id === SUMMARY.id ? example : null)),
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.current),
}));

const LABEL = 'Saved example · captured 1 Oct 2026 · not a live briefing';
const OFFER = /^read the saved example \(captured 1 oct 2026\)$/i;

const RACES = [
  {
    name: 'Monaco Grand Prix',
    location: 'Monte Carlo',
    country: 'Monaco',
    date: '2026-06-07',
    round: 6,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  // Inside the 2026 season, so the quick-select's calendar year is the example's.
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  search.current = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

type StreamAnswer = () => Promise<Response>;

function stubFetch(stream: StreamAnswer): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/races/')) {
      return { ok: true, json: async () => ({ races: RACES }) } as unknown as Response;
    }
    return stream();
  }) as typeof fetch;
}

const refusal: StreamAnswer = async () =>
  ({
    ok: false,
    status: 503,
    json: async () => ({ code: 'busy', retry_after_seconds: 30, limit: 2 }),
    headers: { get: () => null },
  }) as unknown as Response;

async function pickMonaco(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /monaco grand prix/i }));
  await settle();
}

describe('offering the saved example when a live briefing cannot run', () => {
  it('offers it inside the notice box when the cost guard refuses a quick-select race', async () => {
    stubFetch(refusal);
    render(<BriefingChat />);
    await settle();

    await pickMonaco();

    const offer = screen.getByRole('link', { name: OFFER });
    expect(offer).toHaveAttribute('href', '/briefing?example=2026-06-monaco-grand-prix');
    // In the notice's own box, beside the status line it explains.
    const box = screen.getByRole('status').parentElement!;
    expect(box).toContainElement(offer);
  });

  it('keeps the offer outside the live region, so the countdown is not re-announced with it', async () => {
    stubFetch(refusal);
    render(<BriefingChat />);
    await settle();

    await pickMonaco();

    expect(screen.getByRole('status')).not.toContainElement(
      screen.getByRole('link', { name: OFFER }),
    );
  });

  it('offers nothing for a typed name that is not the event', async () => {
    stubFetch(refusal);
    render(<BriefingChat />);
    await settle();

    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await settle();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: OFFER })).toBeNull();
  });

  it('matches on race_info when it arrived before the deadline, whatever was typed', async () => {
    const feed = new ChunkFeed();
    stubFetch(() => feed.fetch());
    render(<BriefingChat />);
    await settle();
    fireEvent.change(screen.getByLabelText('Circuit name'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await settle();

    feed.push(
      frame('race_info', {
        name: 'Monaco Grand Prix',
        year: 2026,
        round: 6,
        location: 'Monte Carlo',
        country: 'Monaco',
        date: '2026-06-07 00:00:00',
        is_upcoming: false,
        as_of: '2026-06-05T11:30:00+00:00',
        sessions: [],
      }),
    );
    feed.push(frame('error', { message: 'Stopped.', code: 'deadline' }));
    feed.close();
    await settle();

    const box = screen.getByRole('alert').parentElement!;
    expect(within(box).getByRole('link', { name: OFFER })).toBeInTheDocument();
  });

  it('offers it when the backend cannot be reached at all', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<BriefingChat />);
    await settle();

    await pickMonaco();

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('link', { name: OFFER })).toBeInTheDocument();
  });

  it('offers nothing for a race with no saved example', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<BriefingChat />);
    await settle();

    fireEvent.change(screen.getByLabelText('Circuit name'), {
      target: { value: 'British Grand Prix' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await settle();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: OFFER })).toBeNull();
  });
});

const MONACO_2026 = {
  name: 'Monaco Grand Prix',
  year: 2026,
  round: 6,
  location: 'Monte Carlo',
  country: 'Monaco',
  date: '2026-06-07 00:00:00',
  is_upcoming: false,
  as_of: '2026-06-05T11:30:00+00:00',
  sessions: [],
};

/** A stream that ends, unannounced, after `frames` — the connection dropped. */
function cut(...frames: string[]): () => Promise<Response> {
  return () => {
    const feed = new ChunkFeed();
    for (const text of frames) feed.push(text);
    feed.close();
    return feed.fetch();
  };
}

describe('offering the saved example when the stream is cut', () => {
  it('offers it under the note when no prose had arrived', async () => {
    stubFetch(cut(frame('race_info', MONACO_2026)));
    render(<BriefingChat />);
    await settle();

    await pickMonaco();
    await settle(200);

    const offer = screen.getByRole('link', { name: OFFER });
    expect(screen.getByRole('status')).toHaveTextContent('before the briefing started');
    expect(screen.getByRole('status').closest('.rounded-lg')).toContainElement(offer);
  });

  it('offers nothing when the cut kept prose, which is a briefing, if an unfinished one', async () => {
    stubFetch(
      cut(frame('race_info', MONACO_2026), frame('briefing_delta', { content: '## Track Profile\n\nTight.' })),
    );
    render(<BriefingChat />);
    await settle();

    await pickMonaco();
    await settle(200);

    expect(screen.getByRole('status')).toHaveTextContent('incomplete');
    expect(screen.queryByRole('link', { name: OFFER })).toBeNull();
  });

  it('offers it once, in the notice, when a retry over a cut run is refused', async () => {
    let call = 0;
    stubFetch(() => (call++ === 0 ? cut(frame('race_info', MONACO_2026))() : refusal()));
    render(<BriefingChat />);
    await settle();
    await pickMonaco();
    await settle(200);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();

    const offers = screen.getAllByRole('link', { name: OFFER });
    expect(offers).toHaveLength(1);
    // The painted copy; its `sr-only` twin says the same for assistive technology.
    const notice = screen
      .getAllByText(/Another briefing is being generated/)[0]!
      .closest('.rounded-lg');
    expect(notice).toContainElement(offers[0]!);
  });
});

describe('the example entry under the input', () => {
  it('links to the featured example', async () => {
    stubFetch(refusal);
    render(<BriefingChat />);
    await settle();

    expect(screen.getByRole('link', { name: 'See an example briefing' })).toHaveAttribute(
      'href',
      '/briefing?example=2026-06-monaco-grand-prix',
    );
  });
});

describe('the example view', () => {
  it('renders the saved briefing with its permanent label, with the backend down', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<BriefingChat exampleId="2026-06-monaco-grand-prix" />);
    await settle(500);

    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Track Profile' })).toBeInTheDocument();
    expect(screen.queryByText('Select a race')).toBeNull();
    // Only the calendar was asked for; the example needs nothing from the backend.
    expect(calls.every((url) => url.includes('/api/races/'))).toBe(true);
  });

  it('cannot be dismissed: the label carries no control', async () => {
    stubFetch(refusal);
    render(<BriefingChat exampleId="2026-06-monaco-grand-prix" />);
    await settle(500);

    const label = screen.getByText(LABEL).closest('[data-saved-example-label]')!;
    expect(label).not.toBeNull();
    expect(within(label as HTMLElement).queryByRole('button')).toBeNull();
    expect(within(label as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('marks the card as an example, so it never reads as a live result', async () => {
    stubFetch(refusal);
    render(<BriefingChat exampleId="2026-06-monaco-grand-prix" />);
    await settle(500);

    expect(screen.getByRole('article', { name: /saved example/i })).toBeInTheDocument();
  });

  it('says so for an id with no saved example', async () => {
    stubFetch(refusal);
    render(<BriefingChat exampleId="2099-01-nowhere" />);
    await settle(500);

    expect(screen.getByText('This saved example could not be found.')).toBeInTheDocument();
    expect(screen.queryByText(LABEL)).toBeNull();
  });

  it('leaves the example for the live run when the visitor generates one', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    stubFetch(refusal);
    render(<BriefingChat exampleId="2026-06-monaco-grand-prix" />);
    await settle(500);

    await pickMonaco();

    expect(replace).toHaveBeenCalledWith(null, '', '/briefing');
  });

  it('reads the example from the URL', async () => {
    search.current = 'example=2026-06-monaco-grand-prix';
    stubFetch(refusal);
    render(<BriefingChatFromUrl />);
    await settle(500);

    expect(screen.getByText(LABEL)).toBeInTheDocument();
  });
});
