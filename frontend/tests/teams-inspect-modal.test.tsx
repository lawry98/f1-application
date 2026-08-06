import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TEAMS } from '@/data/teams-data';
import { InspectModal } from '@/components/teams/inspect-modal';

// The scene needs WebGL, which jsdom has none of. Everything under test here is the dialog shell.
vi.mock('@/components/3d/f1-hero-scene', () => ({
  default: ({ teamColor }: { teamColor: string }) => (
    <div data-testid="car-scene" data-team-color={teamColor} />
  ),
}));

function renderModal(overrides: Partial<Parameters<typeof InspectModal>[0]> = {}) {
  const props = {
    team: TEAMS[1]!,
    index: 1,
    total: TEAMS.length,
    onClose: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    reducedMotion: false,
    ...overrides,
  };
  return { ...render(<InspectModal {...props} />), props };
}

describe('InspectModal', () => {
  it('is a modal dialog named after the team', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(TEAMS[1]!.name);
  });

  it('states where the team sits in the grid, in text and for screen readers', () => {
    renderModal();

    expect(screen.getByText(`02 / ${TEAMS.length}`)).toBeInTheDocument();
    expect(screen.getByText(`Team 2 of ${TEAMS.length}`)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { props } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('walks the grid with the arrow keys', () => {
    const { props } = renderModal();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  it('offers visible previous, next, and close controls', () => {
    const { props } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Previous constructor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next constructor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));

    expect(props.onPrev).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scrolling while open and restores it on close', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('returns focus to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderModal();
    expect(screen.getByRole('button', { name: 'Close inspector' })).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('keeps one scene mounted across team changes, recoloring it in place', () => {
    const { rerender } = render(
      <InspectModal
        team={TEAMS[1]!}
        index={1}
        total={TEAMS.length}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        reducedMotion={false}
      />,
    );
    const scene = screen.getByTestId('car-scene');
    expect(scene).toHaveAttribute('data-team-color', TEAMS[1]!.color);

    rerender(
      <InspectModal
        team={TEAMS[2]!}
        index={2}
        total={TEAMS.length}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        reducedMotion={false}
      />,
    );

    expect(screen.getByTestId('car-scene')).toBe(scene);
    expect(scene).toHaveAttribute('data-team-color', TEAMS[2]!.color);
  });
});
