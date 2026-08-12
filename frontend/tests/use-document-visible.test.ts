import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDocumentVisible } from '@/hooks/use-document-visible';

/** jsdom's `document.visibilityState` is a read-only getter; this replaces it for one test. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('useDocumentVisible', () => {
  // True first, not false first. The caller uses this to decide whether an animation runs, and a
  // scene that starts frozen and unfreezes after an effect is a visible flicker on every open.
  it('starts visible', () => {
    const { result } = renderHook(() => useDocumentVisible());
    expect(result.current).toBe(true);
  });

  it('goes false when the tab is backgrounded', () => {
    const { result } = renderHook(() => useDocumentVisible());
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(false);
  });

  it('comes back when the tab is foregrounded again', () => {
    const { result } = renderHook(() => useDocumentVisible());
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current).toBe(true);
  });

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useDocumentVisible());
    unmount();
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(true);
  });
});
