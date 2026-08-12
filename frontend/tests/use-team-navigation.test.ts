import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';

import { teamIdFromHash, useTeamNavigation } from '@/hooks/use-team-navigation';

const IDS = ['mercedes', 'ferrari', 'mclaren'];

describe('teamIdFromHash', () => {
  it('reads a team id out of a well-formed hash', () => {
    expect(teamIdFromHash('#team-ferrari')).toBe('ferrari');
    expect(teamIdFromHash('#team-racing-bulls')).toBe('racing-bulls');
  });

  it('rejects anything that is not a team fragment', () => {
    expect(teamIdFromHash('')).toBeNull();
    expect(teamIdFromHash('#')).toBeNull();
    expect(teamIdFromHash('#ferrari')).toBeNull();
    expect(teamIdFromHash('#team-')).toBeNull();
    expect(teamIdFromHash('#TEAM-ferrari')).toBeNull();
  });

  // The hash is attacker-controllable and goes nowhere near innerHTML, but it does reach
  // getElementById, so the shape is pinned rather than trusted.
  it('rejects a hash carrying anything outside the id character set', () => {
    expect(teamIdFromHash('#team-ferrari<script>')).toBeNull();
    expect(teamIdFromHash('#team-fer rari')).toBeNull();
  });
});

describe('useTeamNavigation', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;
  let pushState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.location.hash = '';
    replaceState = vi.spyOn(window.history, 'replaceState');
    pushState = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    replaceState.mockRestore();
    pushState.mockRestore();
    window.location.hash = '';
  });

  it('claims the team named in the hash on mount', () => {
    window.location.hash = '#team-mclaren';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).toHaveBeenCalledWith('mclaren');
  });

  it('ignores a hash naming a team that does not exist', () => {
    window.location.hash = '#team-brabham';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).not.toHaveBeenCalled();
  });

  it('claims nothing when there is no hash', () => {
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    expect(claim).not.toHaveBeenCalled();
  });

  // Eleven teams must not become eleven history entries. Scroll-driven changes replace.
  it('replaces the hash as the active id changes, never pushes', () => {
    const claim = vi.fn();
    const { rerender } = renderHook(
      ({ activeId }: { activeId: string }) => useTeamNavigation({ activeId, claim, ids: IDS }),
      { initialProps: { activeId: 'mercedes' } },
    );
    replaceState.mockClear();
    pushState.mockClear();

    rerender({ activeId: 'ferrari' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#team-ferrari');

    rerender({ activeId: 'mclaren' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#team-mclaren');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('does not rewrite the hash when it already names the active id', () => {
    window.location.hash = '#team-ferrari';
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'ferrari', claim, ids: IDS }));
    replaceState.mockClear();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('claims the hash again when the user goes back', () => {
    const claim = vi.fn();
    renderHook(() => useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }));
    claim.mockClear();

    window.location.hash = '#team-mclaren';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(claim).toHaveBeenCalledWith('mclaren');
  });

  it('stops listening for popstate on unmount', () => {
    const claim = vi.fn();
    const { unmount } = renderHook(() =>
      useTeamNavigation({ activeId: 'mercedes', claim, ids: IDS }),
    );
    unmount();
    claim.mockClear();

    window.location.hash = '#team-mclaren';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(claim).not.toHaveBeenCalled();
  });

  // Regression: with a real, state-updating `claim` (as Task 11 wires it), the mount-time
  // hash read and the activeId-sync effect both run in the same commit. If the sync effect
  // reads `activeId` before the caller's setState from `claim` has flowed back in, it would
  // rewrite the just-claimed deep link back to the caller's stale/default team. Asserting
  // only the final hash would pass even with that bug present, since it self-corrects one
  // render later — so this asserts no intermediate call ever names the default team.
  it('never lets the default team overwrite a deep link while claim is still reconciling', () => {
    const claimed: string[] = [];
    const allIds = [...IDS, 'cadillac'];

    function useHarness(initialActiveId: string) {
      const [activeId, setActiveId] = useState(initialActiveId);
      const claim = useCallback((id: string) => {
        claimed.push(id);
        setActiveId(id);
      }, []);
      useTeamNavigation({ activeId, claim, ids: allIds });
      return activeId;
    }

    window.location.hash = '#team-cadillac';
    const { result } = renderHook(() => useHarness('mercedes'));

    expect(replaceState).not.toHaveBeenCalledWith(null, '', '#team-mercedes');
    expect(claimed).toEqual(['cadillac']);
    expect(result.current).toBe('cadillac');
    expect(window.location.hash).toBe('#team-cadillac');
  });

  // Regression, and the direct sibling of the case above. `claimFromHash` used to set the
  // pending flag unconditionally, then call `claim`. When the hash names the team that is
  // *already* active, the caller's `setActiveId` bails, the sync effect never re-runs, and
  // the flag is never cleared — so every later activeId change hits the pending guard and
  // the URL stops tracking scroll for the rest of the session.
  //
  // The route in: click Ferrari, scroll back to McLaren (hash replaced), click Ferrari
  // again, press Back. The popstate target is the already-active McLaren.
  it('keeps the hash tracking scroll after a hash claim that names the active team', () => {
    function useHarness(initialActiveId: string) {
      const [activeId, setActiveId] = useState(initialActiveId);
      const claim = useCallback((id: string) => setActiveId(id), []);
      useTeamNavigation({ activeId, claim, ids: IDS });
      return { activeId, claim };
    }

    window.location.hash = '#team-mclaren';
    const { result } = renderHook(() => useHarness('mclaren'));

    // Back lands on the team that is already active — a no-op claim.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    replaceState.mockClear();

    // The user now scrolls on. The hash must follow.
    act(() => {
      result.current.claim('ferrari');
    });

    expect(replaceState).toHaveBeenCalledWith(null, '', '#team-ferrari');
    expect(window.location.hash).toBe('#team-ferrari');
  });
});
