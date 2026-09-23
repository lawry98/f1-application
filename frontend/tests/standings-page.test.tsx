import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StandingsPage from '@/app/standings/page';

/** The URL's query string, which the page's season now follows through `useSearchParams`. */
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
    usePathname: () => '/standings',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(url.subscribe, url.get, url.get)),
  };
});
// Never settles: this suite is about which season the page opens on, not about its data.
vi.mock('@/lib/api', () => ({
  getStandings: vi.fn(() => new Promise(() => {})),
  getRaces: vi.fn(() => new Promise(() => {})),
}));

beforeEach(() => {
  // Only the clock: the page reads the newest season from it, and nothing here waits on a timer.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StandingsPage', () => {
  it.each([
    ['2024', '2024'],
    ['2023', '2023'],
    ['2019', '2026'],
    ['abc', '2026'],
    [undefined, '2026'],
  ])('?year=%s opens on %s', (param, shown) => {
    url.set(param === undefined ? '' : `?year=${param}`);
    render(<StandingsPage />);

    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue(shown);
  });

  it('marks Standings as the current page in the nav', () => {
    url.set('');
    render(<StandingsPage />);

    expect(screen.getByRole('link', { name: 'Standings' })).toHaveAttribute('aria-current', 'page');
  });
});
