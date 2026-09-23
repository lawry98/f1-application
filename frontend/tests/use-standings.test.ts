import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStandings } from '@/hooks/use-standings';
import { getRaces, getStandings } from '@/lib/api';
import type { Race, StandingsResponse } from '@/types';

// Hoisted above the imports, so the static bindings above are already the mocks. A top-level
// `await import(…)` would pass under vitest and fail `pnpm typecheck` with TS1378.
vi.mock('@/lib/api', () => ({ getStandings: vi.fn(), getRaces: vi.fn() }));
const getStandingsMock = vi.mocked(getStandings);
const getRacesMock = vi.mocked(getRaces);

function table(year: number): StandingsResponse {
  return {
    year,
    races_completed: 1,
    drivers: [
      { position: 1, driver: 'Kimi ANTONELLI', driver_code: 'ANT', team: 'Mercedes', points: 25 },
    ],
    constructors: [{ position: 1, team: 'Mercedes', points: 25 }],
  };
}

const CALENDAR: Race[] = [
  {
    name: 'Australian Grand Prix',
    location: 'Melbourne',
    country: 'Australia',
    date: '2026-03-08',
    round: 1,
  },
];

/** A promise the test settles by hand, to control which response lands first. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  getStandingsMock.mockReset();
  getRacesMock.mockReset();
  getRacesMock.mockResolvedValue(CALENDAR);
  // Both fetch failures are logged on purpose; keep them out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStandings', () => {
  it('fetches the season and its calendar, and reports loading until both land', async () => {
    getStandingsMock.mockResolvedValue(table(2026));

    const { result } = renderHook(() => useStandings(2026));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getStandingsMock).toHaveBeenCalledWith(2026);
    expect(getRacesMock).toHaveBeenCalledWith(2026);
    expect(result.current.standings).toEqual(table(2026));
    expect(result.current.calendar).toEqual(CALENDAR);
    expect(result.current.error).toBe(false);
  });

  it('reports an error when the standings fetch fails', async () => {
    getStandingsMock.mockRejectedValue(new Error('502'));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.standings).toBeNull();
  });

  it('degrades a calendar failure to no calendar, not to an error', async () => {
    // The calendar only enriches the stamp. Failing the page over it would hide a table that
    // loaded fine.
    getStandingsMock.mockResolvedValue(table(2026));
    getRacesMock.mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(false);
    expect(result.current.standings).toEqual(table(2026));
    expect(result.current.calendar).toBeNull();
  });

  it('fetches again on retry, and reports loading while it does', async () => {
    getStandingsMock.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(table(2026));

    const { result } = renderHook(() => useStandings(2026));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);

    await waitFor(() => expect(result.current.standings).toEqual(table(2026)));
    expect(getStandingsMock).toHaveBeenCalledTimes(2);
  });

  it('drops an earlier season that resolves after the current one', async () => {
    // Switch 2025 → 2024 and let 2025 land last. Without the guard the older response overwrites
    // the newer one, and 2025's table renders under a 2024 heading.
    const slow = deferred<StandingsResponse>();
    getStandingsMock.mockImplementation((year) =>
      year === 2025 ? slow.promise : Promise.resolve(table(2024)),
    );

    const { result, rerender } = renderHook(({ year }) => useStandings(year), {
      initialProps: { year: 2025 },
    });
    rerender({ year: 2024 });
    await waitFor(() => expect(result.current.standings?.year).toBe(2024));

    await act(async () => {
      slow.resolve(table(2025));
      await slow.promise;
    });

    expect(result.current.standings?.year).toBe(2024);
  });

  it('reports loading, not the previous table, while a new season is in flight', async () => {
    getStandingsMock.mockImplementation((year) =>
      year === 2026 ? Promise.resolve(table(2026)) : new Promise<StandingsResponse>(() => {}),
    );

    const { result, rerender } = renderHook(({ year }) => useStandings(year), {
      initialProps: { year: 2026 },
    });
    await waitFor(() => expect(result.current.standings?.year).toBe(2026));

    rerender({ year: 2025 });

    expect(result.current.loading).toBe(true);
    expect(result.current.standings).toBeNull();
  });
});
