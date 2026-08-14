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
    expect(result.current.upcoming).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getRacesMock).toHaveBeenCalledWith(2026);
    expect(result.current.upcoming).toHaveLength(1);
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

    expect(result.current.upcoming.map((r) => r.name)).toEqual([
      'Today Grand Prix',
      'Tomorrow Grand Prix',
    ]);
  });

  it('keeps a date-only event happening today, the shape the calendar endpoint really serves', async () => {
    // `/api/races/{year}` omits the time component, and that shape is where feeding the string to
    // `new Date()` goes wrong in a way the space-separated one does not: `new Date('2026-05-10')`
    // is spec'd as **UTC** midnight, so anywhere west of Greenwich it lands on the evening of the
    // 9th in local time and today's race compares as already past. The parser reads the digits.
    getRacesMock.mockResolvedValue([race('Today Grand Prix', '2026-05-10', 5)]);

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.upcoming.map((r) => r.name)).toEqual(['Today Grand Prix']);
  });

  it('drops an unreadable date without taking the rest of the calendar with it', async () => {
    // The failure mode this guards is silent and total: if the comparison ever yields `NaN` for
    // every row — which is what `new Date()` returns for a shape it does not accept — the filter
    // is false for the whole calendar, the quick-select row disappears and the band's ROUND row
    // with it, and nothing is logged. So the assertion is that the *other* races survive.
    getRacesMock.mockResolvedValue([
      race('Broken Grand Prix', 'sometime in June', 6),
      race('Readable Grand Prix', '2026-06-01 00:00:00', 7),
    ]);

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.upcoming.map((r) => r.name)).toEqual(['Readable Grand Prix']);
  });

  it('slices the quick-select view to six while keeping the whole calendar', async () => {
    /*
     * The two are deliberately different lists. Six is a **layout** decision — it is what the
     * chip strip shows — and `roundFor` used to join against that same six-element array, so the
     * band's ROUND row only existed when the requested race happened to be one of the next six
     * events. Every race already run this season resolves fine on the backend and has a real
     * round in the calendar. One fetch, two views.
     */
    getRacesMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        race(`R${i} Grand Prix`, `2026-06-${10 + i} 00:00:00`, i + 1),
      ),
    );

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.upcoming).toHaveLength(6);
    // Soonest first — the row is a chronological strip, not an arbitrary six.
    expect(result.current.upcoming[0]?.name).toBe('R0 Grand Prix');
    expect(result.current.races).toHaveLength(12);
  });

  it('keeps races that have already run in the full calendar, and out of the quick-select view', async () => {
    getRacesMock.mockResolvedValue([
      race('Past Grand Prix', '2026-04-05 00:00:00', 4),
      race('Future Grand Prix', '2026-06-01 00:00:00', 9),
    ]);

    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.races.map((r) => r.name)).toEqual([
      'Past Grand Prix',
      'Future Grand Prix',
    ]);
    expect(result.current.upcoming.map((r) => r.name)).toEqual(['Future Grand Prix']);
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
    expect(result.current.upcoming).toEqual([]);
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
    // The pre-season test that `/api/races/{year}` really includes, and the reason `?? null` is
    // not enough: `0 ?? null` is `0`, and `String(0).padStart(2, '0')` renders `ROUND 00`.
    race('Pre-Season Testing', '2026-02-11 00:00:00', 0),
  ];

  it('joins the stream’s race name back to the calendar round', () => {
    expect(roundFor(races, 'Italian Grand Prix', 2026)).toBe(16);
  });

  it('returns null for a race the calendar does not carry', () => {
    // The normal case for a typed historical query. Adaptation #6 hides the ROUND row rather than
    // printing a placeholder, so `null` is a value the band renders, not an error.
    expect(roundFor(races, 'Monaco Grand Prix', 1988)).toBeNull();
  });

  it('will not lend this season’s round to the same event in another year', () => {
    // The join is on `name`, and a Grand Prix keeps its name for decades — so a name match alone
    // says nothing about the year. `RaceInfo.year` is right there on the event the stream
    // resolved, and ignoring it prints the 2026 round number on a 1988 briefing.
    expect(roundFor(races, 'Italian Grand Prix', 1988)).toBeNull();
    expect(roundFor(races, 'Italian Grand Prix', 2026)).toBe(16);
  });

  it('returns null when the matched race itself has no round', () => {
    // `Race.round` is `number | null` on the wire; a match is not the same as a known round.
    expect(roundFor(races, 'Q', 2026)).toBeNull();
  });

  it('treats round 0 as no round rather than printing ROUND 00', () => {
    // Pre-season testing sits at round 0 in the calendar. It is not a Grand Prix round, and the
    // nullish coalescing that handles a missing round lets a real `0` straight through.
    expect(roundFor(races, 'Pre-Season Testing', 2026)).toBeNull();
  });

  it('returns null against an empty calendar', () => {
    expect(roundFor([], 'Italian Grand Prix', 2026)).toBeNull();
  });
});
