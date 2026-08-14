import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRaces, roundFor } from '@/hooks/use-races';
import { getRaces } from '@/lib/api';
import type { Race } from '@/types';

// `vi.mock` is hoisted above the imports, so the static `getRaces` binding above is already the
// mock by the time this module body runs. A `const { getRaces } = await import(…)` would also
// work at runtime but is a **top-level await**, which this project's `module` setting rejects
// (TS1378) — the suite passes and `pnpm typecheck` fails, which is the worst of both.
vi.mock('@/lib/api', () => ({ getRaces: vi.fn() }));
const getRacesMock = vi.mocked(getRaces);

function race(name: string, date: string, round: number | null): Race {
  return { name, location: name, country: 'Testland', date, round };
}

/**
 * The hook compares against the start of *today*, so the fixtures are built relative to a frozen
 * clock rather than hardcoded. Hardcoding dates would make this suite start failing on a date
 * nobody chose — which is exactly the class of bug the "an event happening today is still
 * upcoming" rule exists to prevent, so it would also hide it.
 */
const NOW = new Date('2026-05-10T14:30:00Z');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  getRacesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRaces', () => {
  it('asks for the current year and reports loading until the fetch lands', async () => {
    getRacesMock.mockResolvedValue([race('A Grand Prix', '2026-06-01 00:00:00', 9)]);

    const { result } = renderHook(() => useRaces());

    expect(result.current.loading).toBe(true);
    expect(result.current.races).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getRacesMock).toHaveBeenCalledWith(2026);
    expect(result.current.races).toHaveLength(1);
  });

  it('keeps an event happening today, and drops one that has passed', async () => {
    // The whole point of `setHours(0,0,0,0)`: at 14:30 on race day the event is still "upcoming".
    // Comparing against `now` instead would make a race weekend vanish from the row at midnight
    // on the morning it starts.
    getRacesMock.mockResolvedValue([
      race('Yesterday Grand Prix', '2026-05-09 00:00:00', 1),
      race('Today Grand Prix', '2026-05-10 00:00:00', 2),
      race('Tomorrow Grand Prix', '2026-05-11 00:00:00', 3),
    ]);

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.races.map((r) => r.name)).toEqual([
      'Today Grand Prix',
      'Tomorrow Grand Prix',
    ]);
  });

  it('slices to six upcoming events', async () => {
    getRacesMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        race(`R${i} Grand Prix`, `2026-06-${10 + i} 00:00:00`, i),
      ),
    );

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.races).toHaveLength(6);
    // Soonest first — the row is a chronological strip, not an arbitrary six.
    expect(result.current.races[0]?.name).toBe('R0 Grand Prix');
  });

  it('degrades to an empty list rather than surfacing an error', async () => {
    // There is deliberately no error state: an empty quick-select row and a band with no ROUND row
    // are already the correct rendering for "we do not know", and the user can still generate a
    // briefing by typing a name. An error banner over a working page would be worse.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getRacesMock.mockRejectedValue(new Error('Failed to fetch races'));

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.races).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not set state after unmount', async () => {
    // A resolved fetch landing after unmount would warn and, worse, keep the component alive in a
    // test's memory. The `active` flag is the guard; this is what proves it is wired.
    let settle: (races: Race[]) => void = () => {};
    getRacesMock.mockReturnValue(
      new Promise<Race[]>((resolve) => {
        settle = resolve;
      }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useRaces());
    unmount();
    settle([race('Late Grand Prix', '2026-06-01 00:00:00', 9)]);
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('roundFor', () => {
  const races = [
    race('Italian Grand Prix', '2026-09-06 00:00:00', 16),
    race('Q', '2026-09-20 00:00:00', null),
  ];

  it('joins the stream’s race name back to the calendar round', () => {
    expect(roundFor(races, 'Italian Grand Prix')).toBe(16);
  });

  it('returns null for a race the calendar does not carry', () => {
    // The normal case for a typed historical query. Adaptation #6 hides the ROUND row rather than
    // printing a placeholder, so `null` is a value the band renders, not an error.
    expect(roundFor(races, 'Monaco Grand Prix 1988')).toBeNull();
  });

  it('returns null when the matched race itself has no round', () => {
    // `Race.round` is `number | null` on the wire; a match is not the same as a known round, and
    // `?.round ?? null` collapses both misses to the one value the band knows how to hide.
    expect(roundFor(races, 'Q')).toBeNull();
  });

  it('returns null against an empty calendar', () => {
    expect(roundFor([], 'Italian Grand Prix')).toBeNull();
  });
});
