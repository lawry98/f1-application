import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMediaQuery } from '@/hooks/use-media-query';

const original = window.matchMedia;

/** A matchMedia whose listeners a test can fire. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
  return {
    fire(next: boolean) {
      listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  window.matchMedia = original;
});

describe('useMediaQuery', () => {
  it('reports a matching query after mount', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(result.current).toBe(true);
  });

  it('reports false for a query that does not match', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(result.current).toBe(false);
  });

  it('follows the query when the viewport changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    act(() => {
      media.fire(true);
    });
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
