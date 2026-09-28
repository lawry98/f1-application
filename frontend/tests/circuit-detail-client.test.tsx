import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitDetailClient } from '@/components/circuits/circuit-detail-client';
import { getCircuitWinners, getRaces } from '@/lib/api';
import { circuitEntry, toPoints, type CircuitEntry } from '@/lib/circuit-geometry';
import monza from '@/data/circuits/it-1922.json';
import type { CircuitWinnersResponse, Race } from '@/types';
import monzaWinners from './fixtures/circuit-winners-it-1922.json';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn(), getCircuitWinners: vi.fn() }));

const query = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query.current),
}));

const getRacesMock = vi.mocked(getRaces);
const winnersMock = vi.mocked(getCircuitWinners);
const MONZA = circuitEntry('it-1922') as CircuitEntry;
const KYALAMI = circuitEntry('za-1961') as CircuitEntry;
const POINTS = toPoints(monza.points);
const WINNERS = monzaWinners as CircuitWinnersResponse;

function renderDetail(circuit = MONZA, search = '') {
  query.current = search;
  return render(<CircuitDetailClient circuit={circuit} points={POINTS} latestYear={2026} />);
}

beforeEach(() => {
  getRacesMock.mockReset();
  winnersMock.mockReset();
  getRacesMock.mockResolvedValue(races2026.races as Race[]);
  winnersMock.mockResolvedValue(WINNERS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('CircuitDetailClient', () => {
  it('states the circuit’s facts from the catalog', () => {
    renderDetail();

    expect(screen.getByRole('heading', { level: 1, name: 'Autodromo Nazionale Monza' })).toBeInTheDocument();
    expect(screen.getByText('5.8 km')).toBeInTheDocument();
    expect(screen.getByText('1950')).toBeInTheDocument();
  });

  it('shows where the circuit sits on the season’s calendar', async () => {
    renderDetail();

    expect(await screen.findByText(/^Round 13 · /)).toBeInTheDocument();
    expect(getRacesMock).toHaveBeenCalledWith(2026);
  });

  it('shows no calendar row for a circuit that season does not visit', async () => {
    renderDetail(KYALAMI);

    await waitFor(() => expect(getRacesMock).toHaveBeenCalled());
    expect(screen.queryByText(/^Round /)).toBeNull();
  });

  it('carries ?year= into the calendar lookup and the back link', async () => {
    renderDetail(MONZA, '?year=2024');

    await waitFor(() => expect(getRacesMock).toHaveBeenCalledWith(2024));
    expect(screen.getByRole('link', { name: '← 2024 circuits' })).toHaveAttribute('href', '/circuits?year=2024');
  });

  it('lists the recent winners under a heading naming the window', async () => {
    renderDetail();

    const section = await screen.findByRole('region', {
      name: `Winners, ${WINNERS.from_year}–${WINNERS.to_year}`,
    });
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(WINNERS.winners.length);
    expect(within(rows[0]!).getByText(WINNERS.winners[0]!.driver)).toBeInTheDocument();
    expect(winnersMock).toHaveBeenCalledWith('it-1922');
  });

  it('says so when the circuit hosted no Grand Prix in the window', async () => {
    winnersMock.mockResolvedValue({ ...WINNERS, winners: [] });
    renderDetail();

    expect(
      await screen.findByText(`No Grand Prix here in ${WINNERS.from_year}–${WINNERS.to_year}.`),
    ).toBeInTheDocument();
  });

  it('names a season whose results could not be loaded', async () => {
    winnersMock.mockResolvedValue({ ...WINNERS, unavailable_years: [2024] });
    renderDetail();

    expect(await screen.findByText('Results for 2024 could not be loaded.')).toBeInTheDocument();
  });

  it('never claims "no Grand Prix" when the empty list is because a year failed to load', async () => {
    winnersMock.mockResolvedValue({ ...WINNERS, winners: [], unavailable_years: [2024] });
    renderDetail();

    expect(await screen.findByText('Results for 2024 could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/^No Grand Prix here in/)).toBeNull();
  });

  it('names the event when one year held two races here', async () => {
    const [first] = WINNERS.winners;
    winnersMock.mockResolvedValue({
      ...WINNERS,
      winners: [
        { ...first!, year: 2024, event: 'Styrian Grand Prix' },
        { ...first!, year: 2024, event: 'Austrian Grand Prix' },
      ],
    });
    renderDetail();

    expect(await screen.findByText('Styrian Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('Austrian Grand Prix')).toBeInTheDocument();
  });

  it('offers a retry when the winners fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    winnersMock.mockRejectedValueOnce(new Error('502'));
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(winnersMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('table');
  });
});
