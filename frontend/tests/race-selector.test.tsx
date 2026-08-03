/**
 * Tests for RaceSelector.
 *
 * The subject is the lock: a click landing while a briefing generates used to abort the
 * run and discard everything it had produced. Styling is not asserted beyond the active
 * marker, which is a contract — the user has to be able to see which race is running.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaceSelector } from '@/components/briefing/race-selector';

const RACES = [
  {
    name: 'Monaco Grand Prix',
    location: 'Monaco',
    country: 'Monaco',
    date: '2099-05-25',
    round: 8,
  },
  {
    name: 'British Grand Prix',
    location: 'Silverstone',
    country: 'UK',
    date: '2099-07-06',
    round: 12,
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render with the race list already resolvable, and wait for the buttons to appear. */
async function renderSelector(props: Partial<Parameters<typeof RaceSelector>[0]> = {}) {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ races: RACES }),
    })) as unknown as typeof fetch;

  const onSelectRace = vi.fn();
  render(<RaceSelector onSelectRace={onSelectRace} {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /monaco/i })).toBeInTheDocument());

  return { onSelectRace };
}

describe('RaceSelector', () => {
  it('selects a race when nothing is generating', async () => {
    const { onSelectRace } = await renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /monaco/i }));

    expect(onSelectRace).toHaveBeenCalledWith('Monaco Grand Prix');
  });

  it('disables every button while a briefing is generating', async () => {
    await renderSelector({ disabled: true });

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('does not select a race from a locked button', async () => {
    // The actual bug: a click here used to abort the in-flight run and discard its output.
    const { onSelectRace } = await renderSelector({ disabled: true });

    fireEvent.click(screen.getByRole('button', { name: /british/i }));

    expect(onSelectRace).not.toHaveBeenCalled();
  });

  it('marks the race that is running', async () => {
    await renderSelector({ disabled: true, activeRace: 'Monaco Grand Prix' });

    expect(screen.getByRole('button', { name: /monaco/i }).className).toContain('border-f1-red');
    expect(screen.getByRole('button', { name: /british/i }).className).not.toContain(
      'border-f1-red',
    );
  });

  it('keeps marking the race after its run has finished', async () => {
    // `activeRace` marks the briefing on screen, not just the one generating.
    await renderSelector({ disabled: false, activeRace: 'Monaco Grand Prix' });

    expect(screen.getByRole('button', { name: /monaco/i }).className).toContain('border-f1-red');
  });

  it('marks nothing when no race is active', async () => {
    await renderSelector();

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toContain('border-f1-red');
    }
  });
});
