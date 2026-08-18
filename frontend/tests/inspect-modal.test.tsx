import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InspectModal } from '@/components/teams/inspect-modal';
import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function renderModal(initialTeamId = 'ferrari', onClose = vi.fn()) {
  return render(<InspectModal teams={TEAMS} initialTeamId={initialTeamId} onClose={onClose} />);
}

/**
 * The modal pulls the Three.js scene in through `next/dynamic` with `ssr: false`, which under
 * jsdom never resolves — it renders the loading fallback and nothing touches WebGL. That is what
 * makes this component testable at all, and it is why this file asserts only on the chrome
 * around the viewer.
 */
describe('InspectModal', () => {
  it('holds every resting neutral in the modal chrome above AA', () => {
    const { container } = renderModal();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('opens on the team it was given', () => {
    renderModal('ferrari');
    expect(screen.getByText(TEAM_MAP['ferrari']!.name)).toBeInTheDocument();
  });

  // Spelled-out sequence, matching `Team 2 of 11` elsewhere. It is the page's running order, not
  // the championship position, and those disagree from row five down.
  it('says where in the grid it is', () => {
    renderModal('ferrari'); // index 1 of 11 in TEAMS order
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  it('advances to the next constructor', () => {
    renderModal('mercedes');
    fireEvent.click(screen.getByRole('button', { name: /next constructor/i }));
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  it('goes back to the previous constructor', () => {
    renderModal('ferrari');
    fireEvent.click(screen.getByRole('button', { name: /previous constructor/i }));
    expect(screen.getByText('01 / 11')).toBeInTheDocument();
  });

  // Wrapping is the spec's decision, so the controls are never disabled and there is never a
  // dead end at either edge.
  it('wraps forward from the last constructor to the first', () => {
    renderModal(TEAMS[TEAMS.length - 1]!.id);
    expect(screen.getByText('11 / 11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next constructor/i }));
    expect(screen.getByText('01 / 11')).toBeInTheDocument();
  });

  it('wraps backward from the first constructor to the last', () => {
    renderModal(TEAMS[0]!.id);
    fireEvent.click(screen.getByRole('button', { name: /previous constructor/i }));
    expect(screen.getByText('11 / 11')).toBeInTheDocument();
  });

  it('names the constructor each control will reach', () => {
    renderModal('ferrari');
    expect(
      screen.getByRole('button', {
        name: new RegExp(`next constructor, ${TEAMS[2]!.shortName}`, 'i'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`previous constructor, ${TEAMS[0]!.shortName}`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('pages with the arrow keys', () => {
    renderModal('ferrari');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('03 / 11')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('02 / 11')).toBeInTheDocument();
  });

  // A dialog's aria-label changing mid-session is not announced, so the team name that changes
  // under the user has to be a live region or a screen-reader user pages blind.
  it('announces the constructor it moved to', () => {
    renderModal('ferrari');
    expect(screen.getByTestId('inspect-team-name')).toHaveAttribute('aria-live', 'polite');
  });

  describe('the dialog semantics it must not lose', () => {
    it('is a modal dialog with a name', () => {
      renderModal('ferrari');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleName(/ferrari/i);
    });

    it('closes on Escape', () => {
      const onClose = vi.fn();
      renderModal('ferrari', onClose);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('closes from the visible control', () => {
      const onClose = vi.fn();
      renderModal('ferrari', onClose);
      fireEvent.click(screen.getByRole('button', { name: /close inspector/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('locks the body while it is open and restores on unmount', () => {
      const { unmount } = renderModal('ferrari');
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    // Paging must not re-run the mount effect. If it does, every arrow press re-locks the body
    // and yanks focus back to whatever was focused before the dialog opened.
    it('does not re-lock the body when the constructor changes', () => {
      renderModal('ferrari');
      const button = screen.getByRole('button', { name: /close inspector/i });
      button.focus();
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(button);
      expect(document.body.style.overflow).toBe('hidden');
    });
  });
});
