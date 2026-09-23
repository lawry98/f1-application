import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StandingsPageClient } from '@/components/standings/standings-page-client';
import { getRaces, getStandings } from '@/lib/api';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import type { Race, StandingsResponse } from '@/types';
import races2026 from './fixtures/races-2026.json';
import standings2024 from './fixtures/standings-2024.json';
import standings2026 from './fixtures/standings-2026.json';
import { ZINC, restingTextNeutrals } from './zinc';

vi.mock('@/lib/api', () => ({ getStandings: vi.fn(), getRaces: vi.fn() }));

/**
 * The URL's query string, as a tiny external store. It models Next's real contract: its patched
 * `history.replaceState` moves `useSearchParams()`, and so do Back, Forward and a `<Link>` — which
 * is exactly what the page's season now follows. `set` is how a test navigates.
 */
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
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(url.subscribe, url.get, url.get)),
  };
});
const getStandingsMock = vi.mocked(getStandings);
const getRacesMock = vi.mocked(getRaces);

const CALENDAR_2026: Race[] = races2026.races;

function race(round: number, name: string): Race {
  return { name, location: 'Somewhere', country: 'Testland', date: '2024-01-01', round };
}

/** 2024's shape: 24 rounds, all held, Abu Dhabi last. */
const CALENDAR_2024: Race[] = [
  ...Array.from({ length: 23 }, (_, i) => race(i + 1, `Round ${i + 1} Grand Prix`)),
  race(24, 'Abu Dhabi Grand Prix'),
];

function notStarted(year: number): StandingsResponse {
  return { year, races_completed: 0, drivers: [], constructors: [] };
}

const MID_SEASON = 'After Round 14 of 23 · Spanish Grand Prix';
const FINAL_2024 = 'After Round 24 of 24 · Abu Dhabi Grand Prix';

/** Renders the page at `/standings` plus `query` — `'?year=2024'`, or `''` for the bare URL. */
function renderPage(query = '', latestYear = 2026) {
  url.set(query);
  return render(<StandingsPageClient latestYear={latestYear} />);
}

/**
 * A filled button's label, judged against the button's own `zinc-800` fill rather than the page —
 * judging it against `DARK_BG` would pass optimistically while the rendered button failed.
 */
function expectReadableOnButton(label: string) {
  const runs = restingTextNeutrals(document.body).filter((run) => run.text === label);
  expect(runs, label).toHaveLength(1);
  for (const run of runs) {
    expect(contrastRatio(run.hex, ZINC['800'] ?? ''), label).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
}

beforeEach(() => {
  getStandingsMock.mockReset();
  getRacesMock.mockReset();
  getStandingsMock.mockImplementation(async (year) =>
    year === 2024 ? standings2024 : standings2026,
  );
  getRacesMock.mockImplementation(async (year) => (year === 2024 ? CALENDAR_2024 : CALENDAR_2026));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Stubbed rather than spied through: the real call would move jsdom's URL for later tests. It
  // moves the query store instead, which is what Next's patched `replaceState` really does.
  vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, next) => {
    url.set(new URL(String(next), 'http://localhost').search);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StandingsPageClient', () => {
  it('offers every covered season, newest first, with the initial one selected', () => {
    renderPage();

    const select = screen.getByRole('combobox', { name: 'Season' });
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['2026', '2025', '2024', '2023']);
    expect(select).toHaveValue('2026');
  });

  it('shows the stamp and both tables once the season lands', async () => {
    renderPage();

    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^drivers' championship/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^constructors' championship/i })).toBeInTheDocument();
    expect(screen.queryByText('Final')).toBeNull();
  });

  it('announces the stamp politely', async () => {
    renderPage();

    expect(await screen.findByText(MID_SEASON)).toHaveAttribute('aria-live', 'polite');
  });

  it('marks a finished season final', async () => {
    renderPage('?year=2024');

    expect(await screen.findByText(FINAL_2024)).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('fetches the chosen season and records it in the URL without adding history', async () => {
    renderPage();
    await screen.findByText(MID_SEASON);

    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: '2024' },
    });

    expect(getStandingsMock).toHaveBeenLastCalledWith(2024);
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/standings?year=2024');
    expect(await screen.findByText(FINAL_2024)).toBeInTheDocument();
  });

  it('keeps the latest season on the bare URL', async () => {
    renderPage('?year=2024');
    await screen.findByText(FINAL_2024);

    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: '2026' },
    });

    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/standings');
  });

  it('follows the URL both ways when it moves without the picker', async () => {
    renderPage('?year=2024');
    await screen.findByText(FINAL_2024);
    const select = screen.getByRole('combobox', { name: 'Season' });

    // The nav's "Standings" link, or Back to the bare URL: Next keeps this page mounted, so a
    // season held in state seeded from a prop stayed on 2024 here.
    act(() => url.set(''));

    expect(select).toHaveValue('2026');
    expect(getStandingsMock).toHaveBeenLastCalledWith(2026);
    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();

    // Back to `?year=2024`.
    act(() => url.set('?year=2024'));

    expect(select).toHaveValue('2024');
    expect(getStandingsMock).toHaveBeenLastCalledWith(2024);
    expect(await screen.findByText(FINAL_2024)).toBeInTheDocument();
  });

  it('says a season that has not started has not started, and offers the last one', async () => {
    getStandingsMock.mockImplementation(async (year) =>
      year === 2027 ? notStarted(2027) : standings2026,
    );
    renderPage('?year=2027', 2027);

    // A status, so switching to a season that has not started is announced.
    expect(await screen.findByRole('status')).toHaveTextContent(
      "The 2027 season hasn't started yet.",
    );
    expect(screen.queryByRole('table')).toBeNull();
    // Not an error, so nothing offers a retry that could never succeed.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expectReadableOnButton('See the 2026 final standings');

    fireEvent.click(screen.getByRole('button', { name: 'See the 2026 final standings' }));

    expect(getStandingsMock).toHaveBeenLastCalledWith(2026);
    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
  });

  it('shows a season whose only held session is a sprint as a table', async () => {
    // The route serves empty tables only when no scoring session has results. A sprint-only
    // weekend has real points with `races_completed: 0`, and hiding it would hide a real table.
    getStandingsMock.mockResolvedValue({ ...standings2026, races_completed: 0 });
    renderPage();

    expect(
      await screen.findByRole('table', { name: /^drivers' championship/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^constructors' championship/i })).toBeInTheDocument();
    expect(screen.queryByText(/hasn't started yet/)).toBeNull();
  });

  it('offers no earlier season before coverage begins', async () => {
    getStandingsMock.mockResolvedValue(notStarted(2023));
    renderPage('?year=2023');

    await screen.findByText("The 2023 season hasn't started yet.");
    expect(screen.queryByRole('button', { name: /final standings/ })).toBeNull();
  });

  it('offers a retry that works when the standings fail', async () => {
    getStandingsMock.mockRejectedValueOnce(new Error('502'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the championship standings.',
    );
    expectReadableOnButton('Try again');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(MID_SEASON)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows placeholders, not an empty page, while loading', () => {
    getStandingsMock.mockImplementation(() => new Promise<StandingsResponse>(() => {}));
    renderPage();

    expect(screen.getByText('Loading standings…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('links the constructors to the team profiles', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Compare the teams →' })).toHaveAttribute(
      'href',
      '/teams',
    );
  });

  it('keeps every neutral readable against what is really behind it', async () => {
    renderPage('?year=2024');
    await screen.findByText('Final');

    const runs = restingTextNeutrals(document.body);
    const onChip = runs.filter((run) => run.text === 'Final');
    const onPage = runs.filter((run) => run.text !== 'Final');

    // The chip is the one filled surface in this state; its label is judged against that fill.
    expect(onChip).toHaveLength(1);
    for (const run of onChip) {
      expect(contrastRatio(run.hex, ZINC['800'] ?? '')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
    expect(onPage.length).toBeGreaterThan(0);
    for (const run of onPage) {
      expect(contrastRatio(run.hex, DARK_BG), run.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
