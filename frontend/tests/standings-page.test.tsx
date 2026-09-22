import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StandingsPage from '@/app/standings/page';

vi.mock('next/navigation', () => ({ usePathname: () => '/standings' }));
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
    render(<StandingsPage searchParams={{ year: param }} />);

    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue(shown);
  });

  it('marks Standings as the current page in the nav', () => {
    render(<StandingsPage searchParams={{}} />);

    expect(screen.getByRole('link', { name: 'Standings' })).toHaveAttribute('aria-current', 'page');
  });
});
