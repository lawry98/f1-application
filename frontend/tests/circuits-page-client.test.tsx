import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitsPageClient } from '@/components/circuits/circuits-page-client';
import { getRaces } from '@/lib/api';
import type { Race } from '@/types';
import races2026 from './fixtures/races-2026.json';

vi.mock('@/lib/api', () => ({ getRaces: vi.fn() }));

/** The URL's query as an external store, modelling Next's patched `replaceState` — see
 * `standings-page-client.test.tsx`, which this mirrors. */
const url = vi.hoisted(() => {
  let query = '';
  const listeners = new Set<() => void>();
  return {
    get: () => query,
    set(next: string) {
      query = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(url.subscribe, url.get, url.get)),
  };
});

const getRacesMock = vi.mocked(getRaces);
const CALENDAR_2026: Race[] = races2026.races;
// The fixture carries pre-season testing rows (round 0) alongside the real calendar; the grid
// draws one card per Grand Prix, never per testing row. 2026 has 23, not the 24 the plan assumed
// — never hardcode it, derive it from the fixture (Ruling P1).
const ROUNDS_2026 = CALENDAR_2026.filter(
  (race) => typeof race.round === 'number' && race.round > 0,
).length;

function renderPage(query = '', latestYear = 2026) {
  url.set(query);
  return render(<CircuitsPageClient latestYear={latestYear} />);
}

beforeEach(() => {
  // Vitest 4 keeps mock calls across tests, which would pollute the retry test's call count
  // (Ruling P5). Reset first, then re-establish the default implementation.
  getRacesMock.mockReset();
  getRacesMock.mockResolvedValue(CALENDAR_2026);
  // Moves the query store instead, which is what Next's patched `replaceState` really does.
  vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, next) => {
    const search = String(next).split('?')[1];
    url.set(search ? `?${search}` : '');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  url.set('');
});

describe('CircuitsPageClient', () => {
  it('draws one card per round of the season, testing excluded', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: '2026 calendar' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(ROUNDS_2026);
    expect(screen.getByRole('heading', { level: 1, name: 'Circuits' })).toBeInTheDocument();
  });

  it('reads the season from the URL', async () => {
    renderPage('?year=2024');

    await screen.findByRole('list', { name: '2024 calendar' });
    expect(getRacesMock).toHaveBeenCalledWith(2024);
  });

  it('ignores an out-of-range year and opens on the latest season', async () => {
    renderPage('?year=2019');

    await screen.findByRole('list', { name: '2026 calendar' });
    expect(getRacesMock).toHaveBeenCalledWith(2026);
  });

  it('writes a picked season with replaceState, and the latest season keeps the bare URL', async () => {
    renderPage();
    await screen.findByRole('list', { name: '2026 calendar' });

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2024' } });
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/circuits?year=2024');
    await screen.findByRole('list', { name: '2024 calendar' });

    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2026' } });
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/circuits');
  });

  it('links to the same season’s standings', async () => {
    renderPage('?year=2024');

    expect(await screen.findByRole('link', { name: '2024 standings →' })).toHaveAttribute(
      'href',
      '/standings?year=2024',
    );
  });

  it('links the latest season’s standings with the bare URL', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: '2026 standings →' })).toHaveAttribute(
      'href',
      '/standings',
    );
  });

  it('offers a retry when the calendar fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getRacesMock.mockRejectedValueOnce(new Error('down'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await screen.findByRole('list', { name: '2026 calendar' });
    await waitFor(() => expect(getRacesMock).toHaveBeenCalledTimes(2));
  });
});
