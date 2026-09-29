import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSeasonCircuits } from '@/hooks/use-season-circuits';
import { getRaces } from '@/lib/api';
import { loadCircuit } from '@/lib/circuit-geometry';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn() }));
vi.mock('@/lib/circuit-geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/circuit-geometry')>();
  return { ...actual, loadCircuit: vi.fn(actual.loadCircuit) };
});

const getRacesMock = vi.mocked(getRaces);
const loadMock = vi.mocked(loadCircuit);
const CALENDAR_2026: Race[] = races2026.races;
// The fixture is the real /api/races/2026 response — round count tracks it rather than a
// hardcoded number, per the plan's own note that the fixture may not have exactly 24 rounds.
const EXPECTED_ROUNDS_2026 = CALENDAR_2026.filter(
  (race) => typeof race.round === 'number' && race.round > 0,
).map((race) => race.round);

function race(round: number, location: string): Race {
  return {
    name: `${location} Grand Prix`,
    location,
    country: 'Testland',
    date: '2025-06-01 00:00:00',
    round,
    event_format: 'conventional',
    official_name: `${location} Grand Prix`,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSeasonCircuits', () => {
  it('drops pre-season testing and returns one card per round, in calendar order', async () => {
    getRacesMock.mockResolvedValue(CALENDAR_2026);
    const { result } = renderHook(() => useSeasonCircuits(2026));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const rounds = result.current.circuits?.map((c) => c.race.round);
    expect(rounds).toEqual(EXPECTED_ROUNDS_2026);
    expect(result.current.circuits?.every((c) => c.geometry !== null && c.slug !== null)).toBe(true);
  });

  it('loads each circuit once however many rounds it hosts', async () => {
    getRacesMock.mockResolvedValue([race(1, 'Spielberg'), race(2, 'Spielberg'), race(3, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(2020));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(loadMock.mock.calls.map(([id]) => id).sort()).toEqual(['at-1969', 'it-1922']);
  });

  it('keeps a round the set has no outline for, with no geometry and no slug', async () => {
    getRacesMock.mockResolvedValue([race(1, 'Brands Hatch'), race(2, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(1985));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.circuits?.[0]).toMatchObject({ geometry: null, slug: null });
    expect(result.current.circuits?.[1]).toMatchObject({ slug: 'monza' });
  });

  it('reports a failed calendar as an error, and retry loads again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getRacesMock.mockRejectedValueOnce(new Error('down')).mockResolvedValue([race(1, 'Monza')]);
    const { result } = renderHook(() => useSeasonCircuits(2026));

    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.circuits).toHaveLength(1));
    expect(result.current.error).toBe(false);
  });

  it('never reports one season under another season’s year', async () => {
    let finishOld: (races: Race[]) => void = () => {};
    getRacesMock
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce([race(1, 'Monza')]);
    const { result, rerender } = renderHook(({ year }) => useSeasonCircuits(year), {
      initialProps: { year: 2025 },
    });

    rerender({ year: 2026 });
    await waitFor(() => expect(result.current.circuits).toHaveLength(1));
    await act(async () => finishOld([race(1, 'Suzuka'), race(2, 'Baku')]));

    expect(result.current.circuits?.map((c) => c.race.location)).toEqual(['Monza']);
  });
});
